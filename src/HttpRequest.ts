import * as HTTP from 'http';

export function get(url: URL, callback: (response: string | Error) => void): HTTP.ClientRequest {
	return HTTP.get(url, resp => {
		let data = '';
		resp.on('data', chunk => {
			data += chunk;
		});
		resp.on('end', () => {
			callback(data);
		});
	}).on('error', err => {
		callback(err);
	});
}