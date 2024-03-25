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

describe('fgUser', () => {
    let FgUser;
    let fgUser;
    let appConfigMock;

    beforeAll(() => {
        jest.mock('../actions/utils', () => ({
            getAioLogger: () => ({
                info: jest.fn(),
                debug: jest.fn(),
                error: jest.fn(),
            }),
        }));

        jest.mock('../actions/sharepoint', () => (jest.fn().mockReturnValue({
            getSharepointAuth: jest.fn().mockReturnValue({
                getUserDetails: jest.fn().mockReturnValue({
                    oid: 'oid1'
                }),
                getAccessToken: jest.fn().mockReturnValue('at')
            }),
            getDriveRoot: jest.fn().mockReturnValue('at')
        })));

        appConfigMock = {
            getConfig: jest.fn().mockReturnValue({
                fgAdminGroups: ['a'],
                fgUserGroups: ['b'],
            }),
        };

        FgUser = require('../actions/fgUser');
        fgUser = new FgUser({ at: 'at', appConfig: appConfigMock });
    });

    afterAll(() => {
        jest.clearAllMocks();
    });

    afterEach(() => {
        fetchMock.reset();
    });

    it('is an admin', async () => {
        fetchMock.get('*', () => ({
            value: ['a']
        }));
        const found = await fgUser.isAdmin();
        expect(found).toBe(true);
    });

    it('admin group is not defined', async () => {
        appConfigMock.getConfig.mockReturnValueOnce({ fgAdminGroups: [] });
        const found = await fgUser.isAdmin();
        expect(found).toBe(false);
    });

    it('is an fg user', async () => {
        fetchMock.get('*', () => ({
            value: ['b']
        }));
        const found = await fgUser.isUser();
        expect(found).toBe(true);
    });

    it('fg user group is not defined', async () => {
        appConfigMock.getConfig.mockReturnValueOnce({ fgUserGroups: [] });
        const found = await fgUser.isUser();
        expect(found).toBe(false);
    });
});
