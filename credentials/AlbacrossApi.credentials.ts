import {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

export class AlbacrossApi implements ICredentialType {
	name = 'albacrossApi';

	displayName = 'Albacross API';

	documentationUrl = 'https://help.albacross.com';

	icon: Icon = 'file:albacross.svg';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'Generate an n8n API key in your Albacross account under Settings → API Keys.',
		},
		{
			displayName: 'Albacross Base URL',
			name: 'baseUrl',
			type: 'hidden',
			default: 'https://api.albacross.com',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Api-Key {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/n8n/me',
			method: 'GET',
		},
	};
}
