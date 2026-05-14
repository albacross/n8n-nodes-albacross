import {
	IDataObject,
	IHookFunctions,
	ILoadOptionsFunctions,
	INodeType,
	INodeTypeDescription,
	INodePropertyOptions,
	IWebhookFunctions,
	IWebhookResponseData,
	NodeConnectionTypes,
} from 'n8n-workflow';

interface AlbacrossSegment {
	id: number;
	name: string;
}

interface AlbacrossBuyerPersona {
	id: number;
	name: string;
}

interface AlbacrossHookResponse {
	id: number;
}

type SendMode = 'new_only' | 'new_and_returning';
type ContactType = 'email' | 'email_phone';
type KeywordSource = 'manual' | 'buyer_persona';
type CountryFilter = 'all' | 'based_on_lead_country' | 'selected';

interface ContactsPayload {
	limit: number;
	with_emails: boolean;
	with_phone_numbers: boolean;
	must_have_contacts: boolean;
	phone_number: boolean;
	keywords: string[];
	export_buyer_persona: boolean;
	buyer_persona_id?: number;
	country_filter_type: CountryFilter;
	countries?: string[];
}

const buildSettingsPage = (instanceBaseUrl: string, workflowId: string): string => {
	const trimmed = instanceBaseUrl.replace(/\/+$/, '');
	return `${trimmed}/workflow/${workflowId}`;
};

const buildHookName = (ctx: IHookFunctions): string => {
	const workflowName = ctx.getWorkflow().name?.trim() || 'Untitled workflow';
	const nodeName = ctx.getNode().name;
	const isTestMode = ctx.getMode() === 'manual';
	return `${workflowName} ${nodeName}${isTestMode ? ' - test' : ''}`;
};

const buildHookBody = (ctx: IHookFunctions): Record<string, unknown> => {
	const segmentId = Number(ctx.getNodeParameter('segmentId'));
	const sendMode = ctx.getNodeParameter('sendMode', 'new_only') as SendMode;
	const contactInputs = readContactInputs(ctx);
	const contactsPayload = buildContactsPayload(contactInputs);
	const webhookUrl = ctx.getNodeWebhookUrl('default') as string;
	const settingsPage = buildSettingsPage(ctx.getInstanceBaseUrl(), ctx.getWorkflow().id ?? '');
	return {
		webhook_url: webhookUrl,
		settings_page: settingsPage,
		segment_id: segmentId,
		conditions: sendModeToConditions(sendMode),
		contacts: contactsPayload ?? null,
		name: buildHookName(ctx),
	};
};

const clearAlbacrossStaticData = (staticData: IDataObject): void => {
	delete staticData.albacrossWorkflowId;
	delete staticData.n8nWorkflowId;
};

const sendModeToConditions = (mode: SendMode): { updates: boolean } => ({
	updates: mode === 'new_and_returning',
});

interface ContactInputs {
	contactsEnabled: boolean;
	contactType: ContactType;
	contactsPerCompany: number;
	keywordSource: KeywordSource;
	keywords: string[];
	buyerPersonaId: number;
	countryFilter: CountryFilter;
	countries: string[];
	mustHaveEmails: boolean;
	mustHavePhoneNumbers: boolean;
	mustHaveContacts: boolean;
}

const readContactInputs = (ctx: IHookFunctions): ContactInputs => {
	const contactsEnabled = ctx.getNodeParameter('contactsEnabled', false) as boolean;
	const contactType = ctx.getNodeParameter('contactType', 'email') as ContactType;
	const contactsPerCompany = Number(ctx.getNodeParameter('contactsPerCompany', 1));
	const keywordSource = ctx.getNodeParameter('keywordSource', 'manual') as KeywordSource;
	const keywords = (ctx.getNodeParameter('keywords', []) as unknown[]).filter(
		(v): v is string => typeof v === 'string' && v.length > 0,
	);
	const buyerPersonaId = Number(ctx.getNodeParameter('buyerPersonaId', 0));
	const countryFilter = ctx.getNodeParameter('countryFilter', 'all') as CountryFilter;
	const countries = (ctx.getNodeParameter('countries', []) as unknown[]).filter(
		(v): v is string => typeof v === 'string' && v.length > 0,
	);
	const mustHaveEmails = ctx.getNodeParameter('mustHaveEmails', false) as boolean;
	const mustHavePhoneNumbers = ctx.getNodeParameter('mustHavePhoneNumbers', false) as boolean;
	const mustHaveContacts = ctx.getNodeParameter('mustHaveContacts', false) as boolean;
	return {
		contactsEnabled,
		contactType,
		contactsPerCompany,
		keywordSource,
		keywords,
		buyerPersonaId,
		countryFilter,
		countries,
		mustHaveEmails,
		mustHavePhoneNumbers,
		mustHaveContacts,
	};
};

const buildContactsPayload = (inputs: ContactInputs): ContactsPayload | undefined => {
	if (!inputs.contactsEnabled) return undefined;

	const payload: ContactsPayload = {
		limit: inputs.contactsPerCompany > 0 ? Math.floor(inputs.contactsPerCompany) : 1,
		with_emails: inputs.mustHaveEmails,
		with_phone_numbers: inputs.mustHavePhoneNumbers,
		must_have_contacts: inputs.mustHaveContacts,
		phone_number: inputs.contactType === 'email_phone',
		keywords: inputs.keywordSource === 'manual' ? inputs.keywords : [],
		export_buyer_persona: inputs.keywordSource === 'buyer_persona',
		country_filter_type: inputs.countryFilter,
	};

	if (inputs.keywordSource === 'buyer_persona' && inputs.buyerPersonaId > 0) {
		payload.buyer_persona_id = inputs.buyerPersonaId;
	}
	if (inputs.countryFilter === 'selected') {
		payload.countries = inputs.countries;
	}
	return payload;
};

export class AlbacrossTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Albacross Trigger',
		name: 'albacrossTrigger',
		icon: 'file:albacross.svg',
		group: ['trigger'],
		version: 1,
		description: 'Receive identified-company leads from Albacross',
		subtitle: '={{$parameter["sendMode"] === "new_and_returning" ? "New & returning companies" : "New companies"}}',
		defaults: {
			name: 'Albacross Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'albacrossApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'albacross-webhook',
			},
		],
		properties: [
			{
				displayName: 'Segment Name or ID',
				name: 'segmentId',
				type: 'options',
				required: true,
				default: '',
				typeOptions: {
					loadOptionsMethod: 'getSegments',
				},
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'What Do You Want to Do?',
				name: 'sendMode',
				type: 'options',
				required: true,
				default: 'new_only',
				noDataExpression: true,
				options: [
					{
						name: 'Send New and Returning Companies',
						value: 'new_and_returning',
						description: 'Trigger for both first-time and repeat appearances of a company',
					},
					{
						name: 'Send Only New Companies',
						value: 'new_only',
						description: 'Trigger only when a company first enters the segment',
					},
				],
			},
			{
				displayName: 'Output Contacts',
				name: 'contactsEnabled',
				type: 'boolean',
				default: false,
				description: 'Whether to enrich each lead with matching contacts. Configure the contact filters below when enabled.',
			},
			{
				displayName: 'Type of Data',
				name: 'contactType',
				type: 'options',
				required: true,
				default: 'email',
				noDataExpression: true,
				displayOptions: { show: { contactsEnabled: [true] } },
				options: [
					{ name: 'Contacts (Email + Phone)', value: 'email_phone' },
					{ name: 'Contacts (Email)', value: 'email' },
				],
			},
			{
				displayName: 'Contacts per Company',
				name: 'contactsPerCompany',
				type: 'number',
				required: true,
				default: 1,
				typeOptions: { minValue: 1, maxValue: 5 },
				displayOptions: { show: { contactsEnabled: [true] } },
				description: 'How many contacts to return per company (1-5)',
			},
			{
				displayName: 'Add Keywords By',
				name: 'keywordSource',
				type: 'options',
				required: true,
				default: 'buyer_persona',
				noDataExpression: true,
				displayOptions: { show: { contactsEnabled: [true] } },
				options: [
					{
						name: 'Buyer Persona',
						value: 'buyer_persona',
						description: 'Pick a saved buyer persona configured in Albacross',
					},
					{
						name: 'Manual Keywords',
						value: 'manual',
						description: 'Type keywords to segment the right contacts',
					},
				],
			},
			{
				displayName: 'Keywords',
				name: 'keywords',
				type: 'string',
				typeOptions: { multipleValues: true },
				default: '',
				placeholder: 'Add Keyword',
				displayOptions: { show: { contactsEnabled: [true], keywordSource: ['manual'] } },
				description: 'Job titles or role keywords used to find the right contacts',
			},
			{
				displayName: 'Buyer Persona Name or ID',
				name: 'buyerPersonaId',
				type: 'options',
				required: true,
				default: '',
				typeOptions: { loadOptionsMethod: 'getBuyerPersonas' },
				displayOptions: { show: { contactsEnabled: [true], keywordSource: ['buyer_persona'] } },
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			},
			{
				displayName: 'Which Countries Do You Want Contacts From?',
				name: 'countryFilter',
				type: 'options',
				required: true,
				default: 'all',
				noDataExpression: true,
				displayOptions: { show: { contactsEnabled: [true] } },
				options: [
					{
						name: 'All Countries',
						value: 'all',
						description: 'No country restriction',
					},
					{
						name: 'Automatically Based on Visiting Company',
						value: 'based_on_lead_country',
						description: "Filter by the lead company's country",
					},
					{
						name: 'Based on Selected Countries',
						value: 'selected',
						description: 'Pick specific country codes below',
					},
				],
			},
			{
				displayName: 'Countries',
				name: 'countries',
				type: 'string',
				required: true,
				typeOptions: { multipleValues: true },
				default: '',
				placeholder: 'Add Country Code',
				displayOptions: { show: { contactsEnabled: [true], countryFilter: ['selected'] } },
				description: 'ISO country codes (e.g., US, DE, SE)',
			},
			{
				displayName: 'Must Have Emails',
				name: 'mustHaveEmails',
				type: 'boolean',
				default: false,
				displayOptions: { show: { contactsEnabled: [true] } },
				description: 'Whether to require contacts to have an email address',
			},
			{
				displayName: 'Must Have Phone Numbers',
				name: 'mustHavePhoneNumbers',
				type: 'boolean',
				default: false,
				displayOptions: { show: { contactsEnabled: [true] } },
				description: 'Whether to require contacts to have a phone number',
			},
			{
				displayName: 'Must Have Contacts',
				name: 'mustHaveContacts',
				type: 'boolean',
				default: false,
				displayOptions: { show: { contactsEnabled: [true] } },
				description: 'Whether to skip leads with no matching contacts',
			},
		],
		usableAsTool: true,
	};

	methods = {
		loadOptions: {
			async getSegments(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const credentials = await this.getCredentials('albacrossApi');
				const baseUrl = credentials.baseUrl as string;

				const segments = (await this.helpers.httpRequestWithAuthentication.call(
					this,
					'albacrossApi',
					{
						method: 'GET',
						baseURL: baseUrl,
						url: '/n8n/segments',
						json: true,
					},
				)) as AlbacrossSegment[];

				return segments.map(({ id, name }) => ({ name, value: id }));
			},
			async getBuyerPersonas(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const credentials = await this.getCredentials('albacrossApi');
				const baseUrl = credentials.baseUrl as string;

				const personas = (await this.helpers.httpRequestWithAuthentication.call(
					this,
					'albacrossApi',
					{
						method: 'GET',
						baseURL: baseUrl,
						url: '/n8n/buyer_personas',
						json: true,
					},
				)) as AlbacrossBuyerPersona[];

				return personas.map(({ id, name }) => ({ name, value: id }));
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const bodyData = this.getBodyData();
		return {
			workflowData: [this.helpers.returnJsonArray(bodyData as IDataObject)],
		};
	}

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				const albacrossWorkflowId = staticData.albacrossWorkflowId as number | undefined;
				if (!albacrossWorkflowId) return false;

				const currentN8nWorkflowId = this.getWorkflow().id ?? '';
				const storedN8nWorkflowId = staticData.n8nWorkflowId as string | undefined;
				if (storedN8nWorkflowId !== undefined && storedN8nWorkflowId !== currentN8nWorkflowId) {
					clearAlbacrossStaticData(staticData);
					return false;
				}

				const credentials = await this.getCredentials('albacrossApi');
				const baseUrl = credentials.baseUrl as string;

				const body = buildHookBody(this);

				try {
					await this.helpers.httpRequestWithAuthentication.call(this, 'albacrossApi', {
						method: 'PATCH',
						baseURL: baseUrl,
						url: `/n8n/hooks/${albacrossWorkflowId}`,
						body,
						json: true,
					});
				} catch (error) {
					const status = (error as { httpCode?: number; response?: { status?: number } }).httpCode
						?? (error as { response?: { status?: number } }).response?.status;
					if (status === 404) {
						clearAlbacrossStaticData(staticData);
						return false;
					}
					throw error;
				}

				staticData.n8nWorkflowId = currentN8nWorkflowId;
				return true;
			},
			async create(this: IHookFunctions): Promise<boolean> {
				const credentials = await this.getCredentials('albacrossApi');
				const baseUrl = credentials.baseUrl as string;
				const body = buildHookBody(this);

				const response = (await this.helpers.httpRequestWithAuthentication.call(
					this,
					'albacrossApi',
					{
						method: 'POST',
						baseURL: baseUrl,
						url: '/n8n/hooks',
						body,
						json: true,
					},
				)) as AlbacrossHookResponse;

				const staticData = this.getWorkflowStaticData('node');
				staticData.albacrossWorkflowId = response.id;
				staticData.n8nWorkflowId = this.getWorkflow().id ?? '';
				return true;
			},
			async delete(this: IHookFunctions): Promise<boolean> {
				const staticData = this.getWorkflowStaticData('node');
				const albacrossWorkflowId = staticData.albacrossWorkflowId;
				if (!albacrossWorkflowId) return true;

				const credentials = await this.getCredentials('albacrossApi');
				const baseUrl = credentials.baseUrl as string;

				try {
					await this.helpers.httpRequestWithAuthentication.call(this, 'albacrossApi', {
						method: 'DELETE',
						baseURL: baseUrl,
						url: `/n8n/hooks/${albacrossWorkflowId}`,
						json: true,
					});
				} catch (error) {
					const status = (error as { httpCode?: number; response?: { status?: number } }).httpCode
						?? (error as { response?: { status?: number } }).response?.status;
					if (status !== 404) throw error;
				}

				return true;
			},
		},
	};
}
