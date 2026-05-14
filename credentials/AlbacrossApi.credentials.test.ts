import { AlbacrossApi } from './AlbacrossApi.credentials';

describe('AlbacrossApi credential', () => {
	const credential = new AlbacrossApi();

	it('declares the expected n8n credential identity', () => {
		expect(credential.name).toBe('albacrossApi');
		expect(credential.displayName).toBe('Albacross API');
	});

	it('exposes apiKey as a required password field', () => {
		const apiKey = credential.properties.find((p) => p.name === 'apiKey');
		expect(apiKey).toBeDefined();
		expect(apiKey?.required).toBe(true);
		expect(apiKey?.type).toBe('string');
		expect(apiKey?.typeOptions).toEqual({ password: true });
	});

	it('sends the API key in the Authorization header on every request', () => {
		expect(credential.authenticate).toEqual({
			type: 'generic',
			properties: {
				headers: {
					Authorization: '=Api-Key {{$credentials.apiKey}}',
				},
			},
		});
	});

	it('verifies the credential by calling GET /n8n/me on the configured base URL', () => {
		expect(credential.test).toEqual({
			request: {
				baseURL: '={{$credentials.baseUrl}}',
				url: '/n8n/me',
				method: 'GET',
			},
		});
	});
});
