import type { IHookFunctions, ILoadOptionsFunctions } from 'n8n-workflow';

import { AlbacrossTrigger } from './AlbacrossTrigger.node';

describe('AlbacrossTrigger node', () => {
	const node = new AlbacrossTrigger();

	it('declares the expected n8n node identity', () => {
		expect(node.description.name).toBe('albacrossTrigger');
		expect(node.description.displayName).toBe('Albacross Trigger');
		expect(node.description.group).toEqual(['trigger']);
		expect(node.description.credentials).toEqual([{ name: 'albacrossApi', required: true }]);
	});

	it('does not expose an Event dropdown (sendMode is the only trigger toggle)', () => {
		expect(node.description.properties.find((p) => p.name === 'event')).toBeUndefined();
		const sendMode = node.description.properties.find((p) => p.name === 'sendMode');
		expect(sendMode?.type).toBe('options');
	});

	it('renders the segment picker via the getSegments loadOptions method', () => {
		const segment = node.description.properties.find((p) => p.name === 'segmentId');
		expect(segment).toBeDefined();
		expect(segment?.type).toBe('options');
		expect(segment?.typeOptions?.loadOptionsMethod).toBe('getSegments');
		expect(segment?.required).toBe(true);
	});

	describe('loadOptions.getSegments', () => {
		it('maps the Albacross response to n8n option pairs', async () => {
			const httpRequestWithAuthentication = jest.fn().mockResolvedValue([
				{ id: 11, name: 'High Intent' },
				{ id: 12, name: 'EU Visitors' },
			]);

			const ctx = {
				getCredentials: jest.fn().mockResolvedValue({ baseUrl: 'https://api.albacross.com' }),
				helpers: { httpRequestWithAuthentication },
			} as unknown as ILoadOptionsFunctions;

			const result = await node.methods.loadOptions.getSegments.call(ctx);

			expect(httpRequestWithAuthentication).toHaveBeenCalledWith('albacrossApi', {
				method: 'GET',
				baseURL: 'https://api.albacross.com',
				url: '/n8n/segments',
				json: true,
			});
			expect(result).toEqual([
				{ name: 'High Intent', value: 11 },
				{ name: 'EU Visitors', value: 12 },
			]);
		});
	});

	describe('webhookMethods.default', () => {
		const fullStateBody = {
			webhook_url: 'https://n8n.example.com/webhook/abc',
			settings_page: 'https://n8n.example.com/workflow/wf-1',
			segment_id: 11,
			conditions: { updates: false },
			contacts: null,
			name: 'Demo workflow Albacross Trigger',
		};

		const buildHookCtx = (overrides: {
			httpResponse?: unknown;
			httpError?: unknown;
			staticData?: Record<string, unknown>;
			parameters?: Record<string, unknown>;
			webhookUrl?: string;
			instanceBaseUrl?: string;
			workflowId?: string;
			workflowName?: string;
			nodeName?: string;
			mode?: string;
		} = {}) => {
			const httpRequestWithAuthentication = jest.fn(async () => {
				if (overrides.httpError) throw overrides.httpError;
				return overrides.httpResponse;
			});
			const staticData = overrides.staticData ?? {};
			const parameters: Record<string, unknown> = overrides.parameters
				?? { segmentId: 11, sendMode: 'new_only', contactsEnabled: false };

			return {
				ctx: {
					getCredentials: jest.fn().mockResolvedValue({ baseUrl: 'https://api.albacross.com' }),
					getNodeWebhookUrl: jest.fn().mockReturnValue(overrides.webhookUrl ?? 'https://n8n.example.com/webhook/abc'),
					getNodeParameter: jest.fn((name: string, fallback?: unknown) =>
						(name in parameters ? parameters[name] : fallback),
					),
					getInstanceBaseUrl: jest.fn().mockReturnValue(overrides.instanceBaseUrl ?? 'https://n8n.example.com/'),
					getWorkflow: jest.fn().mockReturnValue({
						id: overrides.workflowId ?? 'wf-1',
						name: overrides.workflowName ?? 'Demo workflow',
					}),
					getNode: jest.fn().mockReturnValue({
						name: overrides.nodeName ?? 'Albacross Trigger',
					}),
					getWorkflowStaticData: jest.fn().mockReturnValue(staticData),
					getMode: jest.fn().mockReturnValue(overrides.mode ?? 'trigger'),
					helpers: { httpRequestWithAuthentication },
				} as unknown as IHookFunctions,
				httpRequestWithAuthentication,
				staticData,
			};
		};

		describe('checkExists', () => {
			it('returns false when no Albacross workflow id is stored', async () => {
				const { ctx, httpRequestWithAuthentication } = buildHookCtx();
				expect(await node.webhookMethods.default.checkExists.call(ctx)).toBe(false);
				expect(httpRequestWithAuthentication).not.toHaveBeenCalled();
			});

			it('PATCHes the Albacross workflow with the full state and returns true', async () => {
				const { ctx, httpRequestWithAuthentication, staticData } = buildHookCtx({
					staticData: { albacrossWorkflowId: 7, n8nWorkflowId: 'wf-1' },
					httpResponse: { id: 7 },
				});

				expect(await node.webhookMethods.default.checkExists.call(ctx)).toBe(true);
				expect(httpRequestWithAuthentication).toHaveBeenCalledWith('albacrossApi', {
					method: 'PATCH',
					baseURL: 'https://api.albacross.com',
					url: '/n8n/hooks/7',
					body: fullStateBody,
					json: true,
				});
				expect(staticData.n8nWorkflowId).toBe('wf-1');
			});

			it('backfills n8nWorkflowId on legacy nodes that have albacrossWorkflowId but no n8nWorkflowId', async () => {
				const { ctx, httpRequestWithAuthentication, staticData } = buildHookCtx({
					staticData: { albacrossWorkflowId: 7 },
					httpResponse: { id: 7 },
				});

				expect(await node.webhookMethods.default.checkExists.call(ctx)).toBe(true);
				expect(httpRequestWithAuthentication).toHaveBeenCalledTimes(1);
				expect(staticData.n8nWorkflowId).toBe('wf-1');
			});

			it('detects a cloned workflow (different n8n workflow id) and clears stored Albacross ids without calling the API', async () => {
				const { ctx, httpRequestWithAuthentication, staticData } = buildHookCtx({
					staticData: { albacrossWorkflowId: 7, n8nWorkflowId: 'wf-original' },
				});

				expect(await node.webhookMethods.default.checkExists.call(ctx)).toBe(false);
				expect(httpRequestWithAuthentication).not.toHaveBeenCalled();
				expect(staticData.albacrossWorkflowId).toBeUndefined();
				expect(staticData.n8nWorkflowId).toBeUndefined();
			});

			it('returns false and clears all stored ids when PATCH returns 404 (upstream row truly gone)', async () => {
				const { ctx, staticData } = buildHookCtx({
					staticData: { albacrossWorkflowId: 7, n8nWorkflowId: 'wf-1' },
					httpError: { httpCode: 404 },
				});

				expect(await node.webhookMethods.default.checkExists.call(ctx)).toBe(false);
				expect(staticData.albacrossWorkflowId).toBeUndefined();
				expect(staticData.n8nWorkflowId).toBeUndefined();
			});

			it('rethrows non-404 errors from PATCH', async () => {
				const { ctx } = buildHookCtx({
					staticData: { albacrossWorkflowId: 7, n8nWorkflowId: 'wf-1' },
					httpError: { httpCode: 500 },
				});

				await expect(node.webhookMethods.default.checkExists.call(ctx)).rejects.toEqual({ httpCode: 500 });
			});

			it('includes the contacts payload in the PATCH body when contacts are enabled', async () => {
				const { ctx, httpRequestWithAuthentication } = buildHookCtx({
					staticData: { albacrossWorkflowId: 7, n8nWorkflowId: 'wf-1' },
					httpResponse: { id: 7 },
					parameters: {
						segmentId: 11,
						sendMode: 'new_only',
						contactsEnabled: true,
						contactType: 'email',
						contactsPerCompany: 2,
						keywordSource: 'manual',
						keywords: ['cto', 'vp engineering'],
						countryFilter: 'all',
						mustHaveEmails: true,
						mustHavePhoneNumbers: false,
						mustHaveContacts: false,
					},
				});

				await node.webhookMethods.default.checkExists.call(ctx);
				const call = (httpRequestWithAuthentication as jest.Mock).mock.calls[0][1] as {
					body: { contacts: { keywords: string[] } };
				};
				expect(call.body.contacts).toMatchObject({
					limit: 2,
					keywords: ['cto', 'vp engineering'],
					with_emails: true,
				});
			});
		});

		describe('create', () => {
			it('POSTs /n8n/hooks with the full state body and stores the returned id plus the n8n ids', async () => {
				const { ctx, httpRequestWithAuthentication, staticData } = buildHookCtx({
					httpResponse: { id: 999 },
				});

				const result = await node.webhookMethods.default.create.call(ctx);

				expect(result).toBe(true);
				expect(httpRequestWithAuthentication).toHaveBeenCalledWith('albacrossApi', {
					method: 'POST',
					baseURL: 'https://api.albacross.com',
					url: '/n8n/hooks',
					body: fullStateBody,
					json: true,
				});
				expect(staticData.albacrossWorkflowId).toBe(999);
				expect(staticData.n8nWorkflowId).toBe('wf-1');
			});

			it('appends " - test" to the workflow name when n8n calls create in manual mode', async () => {
				const { ctx, httpRequestWithAuthentication } = buildHookCtx({
					httpResponse: { id: 999 },
					mode: 'manual',
				});

				await node.webhookMethods.default.create.call(ctx);

				expect(httpRequestWithAuthentication).toHaveBeenCalledWith(
					'albacrossApi',
					expect.objectContaining({
						body: expect.objectContaining({ name: 'Demo workflow Albacross Trigger - test' }),
					}),
				);
			});

			it('names the Albacross workflow "{n8n workflow name} {n8n node name}"', async () => {
				const { ctx, httpRequestWithAuthentication } = buildHookCtx({
					httpResponse: { id: 999 },
					workflowName: 'Sales pipeline',
					nodeName: 'Albacross Trigger1',
				});

				await node.webhookMethods.default.create.call(ctx);

				expect(httpRequestWithAuthentication).toHaveBeenCalledWith(
					'albacrossApi',
					expect.objectContaining({
						body: expect.objectContaining({ name: 'Sales pipeline Albacross Trigger1' }),
					}),
				);
			});

			it('falls back to "Untitled workflow" when the n8n workflow has no name yet', async () => {
				const { ctx, httpRequestWithAuthentication } = buildHookCtx({
					httpResponse: { id: 999 },
					workflowName: '',
				});

				await node.webhookMethods.default.create.call(ctx);

				expect(httpRequestWithAuthentication).toHaveBeenCalledWith(
					'albacrossApi',
					expect.objectContaining({
						body: expect.objectContaining({ name: 'Untitled workflow Albacross Trigger' }),
					}),
				);
			});
		});

		describe('delete', () => {
			it('DELETEs /n8n/hooks/:id and clears static data so reactivation creates a fresh hook', async () => {
				const { ctx, httpRequestWithAuthentication, staticData } = buildHookCtx({
					staticData: { albacrossWorkflowId: 999, n8nWorkflowId: 'wf-1' },
					httpResponse: undefined,
				});

				const result = await node.webhookMethods.default.delete.call(ctx);

				expect(result).toBe(true);
				expect(httpRequestWithAuthentication).toHaveBeenCalledWith('albacrossApi', {
					method: 'DELETE',
					baseURL: 'https://api.albacross.com',
					url: '/n8n/hooks/999',
					json: true,
				});
				expect(staticData.albacrossWorkflowId).toBeUndefined();
				expect(staticData.n8nWorkflowId).toBeUndefined();
			});

			it('is a no-op when no Albacross workflow id is stored', async () => {
				const { ctx, httpRequestWithAuthentication } = buildHookCtx();

				const result = await node.webhookMethods.default.delete.call(ctx);

				expect(result).toBe(true);
				expect(httpRequestWithAuthentication).not.toHaveBeenCalled();
			});

			it('swallows 404 responses (row already soft-deleted from a previous lifecycle) and clears static data', async () => {
				const { ctx, staticData } = buildHookCtx({
					staticData: { albacrossWorkflowId: 999, n8nWorkflowId: 'wf-1' },
					httpError: { httpCode: 404 },
				});

				await expect(node.webhookMethods.default.delete.call(ctx)).resolves.toBe(true);
				expect(staticData.albacrossWorkflowId).toBeUndefined();
				expect(staticData.n8nWorkflowId).toBeUndefined();
			});

			it('rethrows non-404 errors', async () => {
				const { ctx } = buildHookCtx({
					staticData: { albacrossWorkflowId: 999, n8nWorkflowId: 'wf-1' },
					httpError: { httpCode: 500 },
				});

				await expect(node.webhookMethods.default.delete.call(ctx)).rejects.toEqual({ httpCode: 500 });
			});
		});
	});
});
