import * as HTTP from 'http';

export function get(url: URL, callback: (contentType: string | undefined, response: string | Error) => void): HTTP.ClientRequest {
	return HTTP.get(url, resp => {
		const contentType = resp.headers["content-type"];
		let data = '';
		resp.on('data', chunk => {
			data += chunk;
		});
		resp.on('end', () => {
			callback(contentType, data);
		});
	}).on('error', err => {
		callback(undefined, err);
	});
}