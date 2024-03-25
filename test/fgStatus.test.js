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
jest.mock('crypto', () => ({
    createHash: () => ({
        update: () => ({
            digest: () => 'md5digest'
        })
    })
}));

jest.mock('@adobe/aio-lib-state', () => ({
    init: jest.fn().mockResolvedValue({
        get: jest.fn().mockResolvedValue({
            value: { }
        }),
        put: jest.fn(),
        delete: jest.fn(),
    })
}));

const stateLib = require('@adobe/aio-lib-state');

describe('fgStatus', () => {
    let FgStatus;
    let fgStatus;
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
            getSiteFgRootPath: jest.fn().mockReturnValue('/milo-pink'),
            getPayload: jest.fn().mockReturnValue({
                projectExcelPath: '/mydoc/drafts/fg/prj1.xlsx'
            }),
        };

        FgStatus = require('../actions/fgStatus');
        fgStatus = new FgStatus({
            action: 'promoteAction',
            statusKey: 'skey',
            keySuffix: 'suf',
            appConfig: appConfigMock,
            userDetails: { oid: 'oid1' },
        });
    });

    afterAll(() => {
        jest.clearAllMocks();
    });

    it('generated store key', () => {
        expect(fgStatus.getStoreKey()).toBe('skey');
        const fgStatus2 = new FgStatus({
            action: 'promoteAction',
            appConfig: appConfigMock,
        });
        const storeKey = fgStatus2.generateStoreKey('suf');
        expect(storeKey).toBe('/milo-pinksuf');
    });

    it('key updated', async () => {
        await fgStatus.updateStatusToStateLib({
            status: FgStatus.PROJECT_STATUS.STARTED,
            statusMessage: 'Started',
            activationId: 'AID',
            action: {},
            startTime: new Date(),
            batches: [],
            details: {
                v: '1'
            }
        });
    });

    it('status on action finished', async () => {
        (await stateLib.init()).get.mockResolvedValueOnce({
            value: {
                status: FgStatus.PROJECT_STATUS.IN_PROGRESS,
                statusMessage: 'Steps 2',
                activationId: 'AID2',
                action: {},
            }
        });
        await fgStatus.updateStatusToStateLib({
            status: FgStatus.PROJECT_STATUS.COMPLETED,
            statusMessage: 'Finished',
            activationId: 'AID',
            action: 'promote',
            startTime: new Date(),
            batches: [],
            details: {
                v: '1'
            }
        });
    });

    it('clear status with publish', async () => {
        const deleteSpy = jest.spyOn(await stateLib.init(), 'delete');
        await fgStatus.clearState(false);
        await fgStatus.clearState(true);
        expect(deleteSpy).toHaveBeenCalled();
    });
});
