import { EventEmitter } from 'events';
import * as HttpRequest from './HttpRequest';
import { setTimeout } from 'timers';

export interface CFlatVariable {
	name: string,
	value: string,
	type: string,
	index: number,
	children: CFlatVariable[],
}

export class CFlatRuntime extends EventEmitter {
	private _serverBaseUrl = "http://localhost:4747";
	private _pollInterval = 1000;
	private _pollTimeout: NodeJS.Timeout;
	private _variablesCache: CFlatVariable[] = [];

	constructor() {
		super();
	}

	private request(action: string, callback: (d: any) => void) {
		HttpRequest.get(new URL(this._serverBaseUrl + action), (contentType, response) => {
			if (typeof response == "string") {
				if (contentType === "application/json") {
					callback(JSON.parse(response));
				} else if (contentType === "text/plain") {
					callback(response);
				}
			} else {
				this.stop();
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
			} else if (execution !== "ExternalPaused") {
				this._pollTimeout = setTimeout(() => {
					this.pollExecution();
				}, this._pollInterval);
			}
		});
	}

	public start(url, pollInterval) {
		this._serverBaseUrl = url;
		this._pollInterval = pollInterval;
		this.continue();
	}

	public stop() {
		clearTimeout(this._pollTimeout);
		this.sendEvent("end");
	}

	public continue() {
		this.request("/execution/continue", r => this.handleExecution(r));
		clearTimeout(this._pollTimeout);
		this.pollExecution();
	}

	public step() {
		this.request("/execution/step", r => this.handleExecution(r));
		clearTimeout(this._pollTimeout);
		this.pollExecution();
	}

	public pause() {
		this.request("/execution/pause", r => this.handleExecution(r));
		clearTimeout(this._pollTimeout);
	}

	public stackTrace(startFrame: number, frameCount: number, callback: (r: Array<any>) => void) {
		this.request("/stacktrace", st => {
			const frames = new Array<any>();
			for (let frame of st) {
				const name = frame["name"];
				const sourceUri = frame["sourceUri"];
				const sourceNumber = frame["sourceNumber"];
				const line = frame["line"];
				const column = frame["column"];

				if (
					typeof name === "string" &&
					typeof sourceUri === "string" &&
					typeof sourceNumber === "number" &&
					typeof line === "number" &&
					typeof column === "number"
				) {
					frames.push({
						index: frames.length,
						name,
						sourceUri,
						sourceNumber,
						line,
						column,
					});
				}
			}

			callback(frames.slice(startFrame, startFrame + frameCount));
		});
	}

	public source(uri: string, callback: (c: string) => void) {
		uri = uri.replace(/\\/g, "/").replace(/(.*)\.\w+$/, "$1");
		this.request(`/sources/content?uri=${uri}`, content => {
			if (typeof content === "string") {
				callback(content);
			}
		});
	}

	public setBreakPoints(path: string, lines: number[], callback: (r: number[]) => void) {
		const joinedLines = lines.join(",");
		this.request(`/breakpoints/set?path=${path}&lines=${joinedLines}`, bpls => {
			const breakpoints: number[] = [];
			for (let line of bpls) {
				if (typeof line === "number") {
					breakpoints.push(line);
				}
			}

			callback(breakpoints);
		});
	}

	public variables(index: number, start: number, count: number, callback: (r: CFlatVariable[]) => void) {
		if (index > 0) {
			const v = this.findVariableAtIndex(this._variablesCache, index);
			const vars = v !== null ? v.children : [];
			callback(vars);
		} else {
			this.request("/values/stack", vars => {
				this._variablesCache = this.parseVariables(vars);
				callback(this._variablesCache.slice(start, start + count));
			});
		}
	}

	private parseVariables(vars: any[]): CFlatVariable[] {
		const variables: CFlatVariable[] = [];

		for (let v of vars) {
			const name = v["name"];
			const type = v["type"];
			const value = v["value"];
			const index = v["index"];
			const children = v["children"];
			if (
				typeof name === "string" &&
				typeof type === "string" &&
				typeof value === "string" &&
				typeof index === "number" &&
				typeof children === "object"
			) {
				variables.push({
					name,
					type,
					value,
					index,
					children: this.parseVariables(children)
				});
			}
		}

		return variables;
	}

	private findVariableAtIndex(vars: CFlatVariable[], index: number): CFlatVariable | null {
		for (let v of vars) {
			if (v.index === index) {
				return v;
			}

			const child = this.findVariableAtIndex(v.children, index);
			if (child !== null) {
				return child;
			}
		}

		return null;
	}

	private sendEvent(event: string, ...args: any[]) {
		setImmediate(_ => {
			this.emit(event, ...args);
		});
	}
}