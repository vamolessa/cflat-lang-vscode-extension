/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { EventEmitter } from 'events';
import * as HttpRequest from './HttpRequest';

/**
 * A CFlat runtime with debugger functionality.
 */
export class CFlatRuntime extends EventEmitter {
	private _serverBaseUrl = "http://localhost:4747";

	constructor() {
		super();
	}

	private request(action: string, callback: (d: any) => void) {
		HttpRequest.get(new URL(this._serverBaseUrl + action), (response) => {
			if (typeof (response) == "string") {
				callback(JSON.parse(response));
			} else {
				this.sendEvent("end");
			}
		});
	}

	private escapePath(path: string): string {
		return path.replace(/\/|\\/g, ".");
	}

	private handleExecution(response: any) {
		let execution = response["execution"];
		if (execution === "ExternalPaused") {
			this.sendEvent("stopOnPause");
		} else if (execution === "BreakpointPaused") {
			this.sendEvent("stopOnBreakpoint");
		} else if (execution === "StepPaused") {
			this.sendEvent("stopOnStep");
		}
	}

	public start() {
		this.request("/execution/continue", r => this.handleExecution(r));
	}

	public continue() {
		this.request("/execution/continue", r => this.handleExecution(r));

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
	}

	public pause() {
		this.request("/execution/pause", r => this.handleExecution(r));
	}

	public stack(startFrame: number, endFrame: number, callback: (r: Array<any>) => void) {
		//this.request("/stacktrace", st => {
		this.request(`/stacktrace?${startFrame}&${endFrame}`, st => {
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

			callback(frames);
		});
	}

	/*
	 * Set breakpoint in file with given line.
	 */
	public setBreakPoints(path: string, lines: number[], callback: (r: number[]) => void) {
		path = this.escapePath(path);
		const joinedLines = lines.join(",");
		this.request(`/breakpoints/set?source=${path}&lines=${joinedLines}`, bpls => {
			const breakpoints: number[] = [];
			for (let line of bpls) {
				if (typeof (line) === "number") {
					breakpoints.push(line);
				}
			}

			callback(breakpoints);
		});
	}

	// private methods

	/**
	 * Run through the file.
	 * If stepEvent is specified only run a single step and emit the stepEvent.
	 */
	/*
	private run(stepEvent?: string) {
		for (let ln = this._currentLine + 1; ln < this._sourceLines.length; ln++) {
			if (this.fireEventsForLine(ln, stepEvent)) {
				this._currentLine = ln;
				return true;
			}
		}
		// no more lines: run to end
		this.sendEvent('end');
	}
	*/

	/**
	 * Fire events if line has a breakpoint or the word 'exception' is found.
	 * Returns true is execution needs to stop.
	 */
	/*
	private fireEventsForLine(ln: number, stepEvent?: string): boolean {

		const line = this._sourceLines[ln].trim();

		// if 'log(...)' found in source -> send argument to debug console
		const matches = /log\((.*)\)/.exec(line);
		if (matches && matches.length === 2) {
			this.sendEvent('output', matches[1], this._sourceFile, ln, matches.index)
		}

		// if a word in a line matches a data breakpoint, fire a 'dataBreakpoint' event
		const words = line.split(" ");
		for (let word of words) {
			if (this._breakAddresses.has(word)) {
				this.sendEvent('stopOnDataBreakpoint');
				return true;
			}
		}

		// if word 'exception' found in source -> throw exception
		if (line.indexOf('exception') >= 0) {
			this.sendEvent('stopOnException');
			return true;
		}

		// is there a breakpoint?
		const breakpoints = this._breakPoints.get(this._sourceFile);
		if (breakpoints) {
			const bps = breakpoints.filter(bp => bp.line === ln);
			if (bps.length > 0) {

				// send 'stopped' event
				this.sendEvent('stopOnBreakpoint');

				// the following shows the use of 'breakpoint' events to update properties of a breakpoint in the UI
				// if breakpoint is not yet verified, verify it now and send a 'breakpoint' update event
				if (!bps[0].verified) {
					bps[0].verified = true;
					this.sendEvent('breakpointValidated', bps[0]);
				}
				return true;
			}
		}

		// non-empty line
		if (stepEvent && line.length > 0) {
			this.sendEvent(stepEvent);
			return true;
		}

		// nothing interesting found -> continue
		return false;
	}
	*/

	private sendEvent(event: string, ...args: any[]) {
		setImmediate(_ => {
			this.emit(event, ...args);
		});
	}
}