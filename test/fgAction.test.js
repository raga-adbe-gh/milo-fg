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

const AppConfig = require('../actions/appConfig');

// Mock the 'crypto' module
jest.mock('crypto', () => ({
    createPrivateKey: jest.fn().mockReturnValue({
        export: jest.fn().mockReturnValue('mocked')
    })
}));

let params = {
    spToken: 'eyJ0eXAi',
    adminPageUri: 'http://localhost:3000/tools/floodgate/index.html?project=milo--adobecom&referrer=',
    projectExcelPath: '/drafts/floodgate/projects/raga/fgtest1.xlsx',
    shareUrl: 'https://site.sharepoint.com/:f:/r/sites/adobecom/Shared%20Documents/milo<relativePath>?web=1',
    fgShareUrl: 'https://site.sharepoint.com/:f:/r/sites/adobecom/Shared%20Documents/milo-pink<relativePath>?web=1',
    rootFolder: '/milo',
    fgRootFolder: '/milo-pink',
    promoteIgnorePaths: '/gnav.docx,/.milo',
    doPublish: 'false',
    driveId: 'drive',
    fgColor: 'purple',
    draftsOnly: 'true'
};
// Add config
params = {
    ...params,
    fgSite: 'https://graph.microsoft.com/v1.0/sites/site.sharepoint.com,d21',
    fgClientId: '008626ae-1',
    fgAuthority: 'https://login.microsoftonline.com/fa7b1b5a-',
    clientId: '008626ae-1',
    tenantId: 'a',
    certPassword: 'a',
    certKey: 'a',
    certThumbprint: 'a',
    skipInProgressCheck: 'true',
    batchFilesPath: 'milo-floodgate/batching',
    maxFilesPerBatch: '200',
    numBulkReq: '20',
    groupCheckUrl: 'https://graph.microsoft.com/v1.0/groups/{groupOid}/members?$count=true',
    fgUserGroups: '["1"]',
    fgAdminGroups: '["2"]',
    fgDirPattern: '.*/sites(/.*)<',
    siteRootPathRex: '(pink)$',
    helixAdminApiKeys: '{"milo": "ey:","milo-pink": "dy"}',
    bulkPreviewCheckInterval: '8',
    maxBulkPreviewChecks: '100',
    enablePreviewPublish: 'true'
};

describe('appConfig', () => {
    test('set parameters', () => {
        const appConfig = new AppConfig(params);
        expect(appConfig.getPayload()).toBeDefined();
        expect(appConfig.getConfig()).toBeDefined();
        expect(appConfig.getPassthruParams()).toBeDefined();
        expect(appConfig.getPassthruParams().spToken).not.toBeDefined();
        appConfig.extractPrivateKey();
        const {
            clientId, tenantId, certPassword, pvtKey = 'mocked', certThumbprint
        } = params;
        expect({ ...appConfig.getMsalConfig() }).toMatchObject({
            clientId, tenantId, certPassword, pvtKey, certThumbprint
        });
        expect(appConfig.getFgSite()).toBe(params.fgSite);
        expect(appConfig.getPromoteIgnorePaths().length).toBe(6);
        expect(appConfig.getSkipInProgressCheck()).toBeTruthy();
        expect({ ...appConfig.getBatchConfig() }).toMatchObject({ batchFilesPath: params.batchFilesPath, maxFilesPerBatch: 200 });
        expect(appConfig.getNumBulkReq()).toBe(20);
        expect(appConfig.extractSiteRootPath()).toBe('/');
        expect(appConfig.getSiteFgRootPath()).toBe('/adobecom/Shared%20Documents/milo-pink');
        expect(appConfig.getUrlInfo()).toMatchObject({
            urlInfoMap: {
                branch: 'main', origin: 'https://main--milo--adobecom.hlx.page', owner: 'adobecom', repo: 'milo', sp: ''
            }
        });
        expect(appConfig.isDraftOnly()).toBeTruthy();
        expect(appConfig.getDoPublish()).not.toBeTruthy();
        expect(!!appConfig.getPdoverride()).toBeFalsy();
        expect(!!appConfig.getEdgeWorkerEndDate()).toBeFalsy();
    });

    test('isDraftOnly would be true when not passed', () => {
        const { draftsOnly, ...remParams } = params;
        const appConfig = new AppConfig(params);
        expect(appConfig.isDraftOnly()).toBeTruthy();
        expect(remParams).toBeDefined();
    });

    test('isDraftOnly is false when parameter is passed', () => {
        const { draftsOnly, ...remParams } = params;
        const appConfig = new AppConfig({ draftsOnly: null, ...remParams });
        expect(appConfig.isDraftOnly()).toBeFalsy();
    });

    test('Test pdoverride and edgeWorkerEndDate', () => {
        const appConfig = new AppConfig({ ...params, pdoverride: 'false', edgeWorkerEndDate: 'Wed, 20 Dec 2023 13:56:49 GMT' });
        expect(appConfig.getPdoverride()).toBeFalsy();
        expect(appConfig.getEdgeWorkerEndDate().getTime()).toBe(1703080609000);
    });
});
