import { EventEmitter } from 'events';
import * as HttpRequest from './HttpRequest';
import { setTimeout } from 'timers';

export interface CFlatVariable {
	name: string,
	value: string,
	type: string,
	stackIndex: number,
}

export class CFlatRuntime extends EventEmitter {
	private _serverBaseUrl = "http://localhost:4747";
	private _pollInterval = 1000;
	private _pollTimeout: NodeJS.Timeout;

	constructor() {
		super();
	}

	private request(action: string, callback: (d: any) => void) {
		HttpRequest.get(new URL(this._serverBaseUrl + action), (response) => {
			if (typeof response == "string") {
				callback(JSON.parse(response));
			} else {
				clearTimeout(this._pollTimeout);
				this.sendEvent("end");
			}
		});
	}

	private handleExecution(response: any) {
		let execution = response["execution"];
		if (execution === "ExternalPaused") {
			this.sendEvent("stopOnPause");
			clearTimeout(this._pollTimeout);
		} else if (execution === "BreakpointPaused") {
			this.sendEvent("stopOnBreakpoint");
			clearTimeout(this._pollTimeout);
		} else if (execution === "StepPaused") {
			this.sendEvent("stopOnStep");
			clearTimeout(this._pollTimeout);
		}
	}

	private pollExecution() {
		this.request("/execution/poll", response => {
			let execution = response["execution"];
			if (execution === "BreakpointPaused") {
				this.sendEvent("stopOnBreakpoint");
			} else if (execution === "StepPaused") {
				this.sendEvent("stopOnStep");
			}

			this._pollTimeout = setTimeout(() => {
				this.pollExecution();
			}, this._pollInterval);
		});
	}

	public start() {
		this.continue();
	}

	public stop() {
		clearTimeout(this._pollTimeout);
	}

	public continue() {
		this.request("/execution/continue", r => this.handleExecution(r));
		clearTimeout(this._pollTimeout);
		this.pollExecution();

		let never = false
		if (never) {
			this.sendEvent('stopOnEntry');
			this.sendEvent('stopOnBreakpoint');
			this.sendEvent('stopOnStep');
			this.sendEvent('end');
		}
	}

	public step() {
		this.request("/execution/step", r => this.handleExecution(r));
		clearTimeout(this._pollTimeout);
		this.pollExecution();
	}

	public pause() {
		this.request("/execution/pause", r => this.handleExecution(r));
	}

	public stackTrace(startFrame: number, frameCount: number, callback: (r: Array<any>) => void) {
		this.request("/stacktrace", st => {
			const frames = new Array<any>();
			for (let frame of st) {
				frames.push({
					index: frames.length,
					name: frame["name"],
					file: frame["source"],
					line: frame["line"],
					column: frame["column"],
				});
			}

			callback(frames.slice(startFrame, startFrame + frameCount));
		});
	}

	public setBreakPoints(path: string, lines: number[], callback: (r: number[]) => void) {
		const joinedLines = lines.join(",");
		this.request(`/breakpoints/set?source=${path}&lines=${joinedLines}`, bpls => {
			const breakpoints: number[] = [];
			for (let line of bpls) {
				if (typeof line === "number") {
					breakpoints.push(line);
				}
			}

			callback(breakpoints);
		});
	}

	public variables(reference: number, start: number, count: number, callback: (r: CFlatVariable[]) => void) {
		this.request("/values", vars => {
			var variables: CFlatVariable[] = [];
			for (let v of vars) {
				const name = v["name"];
				const type = v["type"];
				const value = v["value"];
				const stackIndex = v["stackIndex"];
				if (
					typeof name === "string" &&
					typeof type === "string" &&
					typeof value === "string" &&
					typeof stackIndex === "number"
				) {
					variables.push({ name, type, value, stackIndex });
				}
			}

			callback(variables.slice(start, start + count));
		});
	}

	private sendEvent(event: string, ...args: any[]) {
		setImmediate(_ => {
			this.emit(event, ...args);
		});
	}
}