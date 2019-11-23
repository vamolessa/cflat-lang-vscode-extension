import { EventEmitter } from 'events';
import * as HttpRequest from './HttpRequest';
import { setTimeout } from 'timers';

export interface CFlatVariable {
	name: string,
	type: string,
	value: string,
	values: CFlatVariable[] | undefined,
	reference: number,
}

export class CFlatRuntime extends EventEmitter {
	private _serverBaseUrl = "http://localhost:4747";
	private _pollInterval = 1000;
	private _pollTimeout: NodeJS.Timeout;
	private _variableReferences: string[] = [];

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
		clearTimeout(this._pollTimeout);
		this.pollExecution();
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
				const line = frame["line"];
				const column = frame["column"];

				if (
					typeof name === "string" &&
					typeof sourceUri === "string" &&
					typeof line === "number" &&
					typeof column === "number"
				) {
					frames.push({
						index: frames.length,
						name,
						sourceUri,
						line,
						column,
					});
				}
			}

			callback(frames.slice(startFrame, startFrame + frameCount));
		});
	}

	private parseUri(uri: string): string {
		return uri.replace(/\\/g, "/").replace(/(.*)\.\w+$/, "$1");
	}

	public sources(callback: (us: string[]) => void) {
		this.request("/sources/list", uris => {
			callback(uris);
		});
	}

	public source(uri: string, callback: (c: string) => void) {
		uri = this.parseUri(uri);
		this.request(`/sources/content?uri=${uri}`, content => {
			if (typeof content === "string") {
				callback(content);
			} else {
				callback("\n");
			}
		});
	}

	public setBreakPoints(path: string, lines: number[], callback: (uri: string, lines: number[]) => void) {
		path = this.parseUri(path);
		const joinedLines = lines.join(",");

		this.request(`/breakpoints/set?path=${path}&lines=${joinedLines}`, r => {
			const sourceUri = r["sourceUri"];
			const lines = r["breakpoints"];

			const breakpoints: number[] = [];
			if (typeof sourceUri === "string") {
				for (let line of lines) {
					if (typeof line === "number") {
						breakpoints.push(line);
					}
				}

				callback(sourceUri, breakpoints);
			} else {
				callback(path, []);
			}
		});
	}

	public variables(reference: number, callback: (r: CFlatVariable[]) => void) {
		if (reference > 0) {
			if (reference <= this._variableReferences.length) {
				const path = this._variableReferences[reference - 1];
				this.evaluate(path, v => {
					callback(v && v.values ? v.values : []);
				});
			} else {
				callback([]);
			}
		} else {
			this.request("/values", vars => {
				const values = this.parseVariables("", vars["values"]) || [];
				callback(values);
			});
		}
	}

	private parseVariables(path: string, vars: any[]): CFlatVariable[] | undefined {
		if (!vars) {
			return undefined;
		}

		const variables: CFlatVariable[] = [];

		for (let v of vars) {
			const varName = v["name"];
			path = path.length > 0 ? path + "." + varName : varName;
			const variable = this.parseVariable(path, v);
			if (variable) {
				variables.push(variable);
			}
		}

		return variables;
	}

	private parseVariable(path: string, v: any): CFlatVariable | undefined {
		const name = v["name"];
		const type = v["type"];
		const value = v["value"];
		if (
			typeof name === "string" &&
			typeof type === "string" &&
			typeof value === "string"
		) {
			let reference = 0;

			const values = this.parseVariables(path, v["values"]);
			if (values) {
				for (let i = 0; i < this._variableReferences.length; i++) {
					const r = this._variableReferences[i];
					if (r === path) {
						reference = i + 1;
						break;
					}
				}
				if (reference === 0) {
					this._variableReferences.push(path);
					reference = this._variableReferences.length;
				}
			}

			return { name, type, value, values, reference };
		}

		return undefined;
	}

	public evaluate(path: string, callback: (r: CFlatVariable | undefined) => void) {
		this.request(`/values?path=${path}`, v => {
			callback(this.parseVariable(path, v));
		});
	}

	private sendEvent(event: string, ...args: any[]) {
		setImmediate(_ => {
			this.emit(event, ...args);
		});
	}
}