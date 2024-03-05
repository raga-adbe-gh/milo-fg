/* ************************************************************************
 * ADOBE CONFIDENTIAL
 * ___________________
 *
 * Copyright 2023 Adobe
 * All Rights Reserved.
 *
 * NOTICE: All information contained herein is, and remains
 * the property of Adobe and its suppliers, if any. The intellectual
 * and technical concepts contained herein are proprietary to Adobe
 * and its suppliers and are protected by all applicable intellectual
 * property laws, including trade secret and copyright laws.
 * Dissemination of this information or reproduction of this material
 * is strictly forbidden unless prior written permission is obtained
 * from Adobe.
 ************************************************************************* */
/* eslint-disable global-require */
jest.mock('node-fetch', () => require('fetch-mock-jest').sandbox());
const fetchMock = require('node-fetch');
const UrlInfo = require('../actions/urlInfo');

describe('HelixUtils', () => {
    let HelixUtils;
    let helixUtils;
    let appConfigMock;

    beforeAll(() => {
        jest.mock('../actions/utils', () => ({
            getAioLogger: () => ({
                info: jest.fn(),
                debug: jest.fn(),
                error: jest.fn(),
            }),
        }));

        appConfigMock = {
            getUrlInfo: jest.fn().mockReturnValue(
                new UrlInfo('https://example.com/admin?project=p&referrer=https://sp/&owner=o&repo=rp&ref=main')
            ),
            getConfig: jest.fn().mockReturnValue({
                maxBulkPreviewChecks: 2,
                helixAdminApiKeys: { rp: 'key', 'rp-pink': 'key-pink' },
                enablePreviewPublish: ['rp', 'rp-pink']
            }),
        };
        HelixUtils = require('../actions/helixUtils');
        helixUtils = new HelixUtils(appConfigMock);
    });

    afterAll(() => {
        jest.clearAllMocks();
    });

    it('should return PREVIEW and LIVE', () => {
        const operations = helixUtils.getOperations();
        expect(operations).toEqual({ PREVIEW: 'preview', LIVE: 'live' });
    });

    it('should return repo without floodgate', () => {
        const repo = helixUtils.getRepo();
        expect(repo).toBe('rp');
    });

    it('should return repo with floodgate', () => {
        const repo = helixUtils.getRepo(true, 'blue');
        expect(repo).toBe('rp-blue');
    });

    it('should return admin api key without floodgate', () => {
        const adminApiKey = helixUtils.getAdminApiKey();
        expect(adminApiKey).toBe('key');
    });

    it('should return admin api key with floodgate', () => {
        const adminApiKey = helixUtils.getAdminApiKey(true, 'pink');
        expect(adminApiKey).toBe('key-pink');
    });

    it('should return true if preview is enabled', () => {
        const canPreview = helixUtils.canBulkPreviewPublish();
        expect(canPreview).toBeTruthy();
    });

    it('submits bulk preview and publish request', async () => {
        fetchMock.post('*', () => ({
            messageId: 'a',
            job: {
                name: 'JN',
            }
        }));
        fetchMock.get('*', () => ({
            progress: 'stopped',
            data: {
                resources: [
                    { path: '/a', status: 200 },
                    { path: '/b', status: 200 },
                ],
            }
        }));
        const resp = await helixUtils.bulkPreviewPublish(
            ['/a', '/b'],
            'preivew',
            { isFloodgate: false },
            1
        );
        expect(resp).toEqual([{ path: '/a', success: true },
            { path: '/b', success: true }]);
    });
});
