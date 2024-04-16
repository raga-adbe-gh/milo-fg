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

describe('sharepointAuth', () => {
    let SharepointAuth = null;
    const testTknStr =
    'ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SmhkV1FpT2lJd01EQXd' +
    'NREF3TVMwd01EQXdMVEF3TURBdE1EQXdNQzB3TURBd01EQXdNREF3TURBaUxDSnBjM01p' +
    'T2lKb2RIUndjem92TDNOMGN5NTNhVzVrYjNkekxtNWxkQzh4TVRFeE1URXhMVEV4TVRFdE' +
    '1URXhNUzB4TVRFeExURXhNVEV4TVRFeE1URXhNUzhpTENKaGNIQmZaR2x6Y0d4aGVXNWhi' +
    'V1VpT2lKSGNtRndhQ0JGZUhCc2IzSmxjaUlzSW1Gd2NHbGtJam9pTWpJeU1qSXlNaTB4TV' +
    'RFeExURXhNVEV0TVRFeE1TMHhNVEV4TVRFeE1URXhNVEVpTENKaGNIQnBaR0ZqY2lJNklq' +
    'QWlMQ0ptWVcxcGJIbGZibUZ0WlNJNklrRWlMQ0puYVhabGJsOXVZVzFsSWpvaVZYTmxjaU' +
    'lzSW1sa2RIbHdJam9pZFhObGNpSXNJbTVoYldVaU9pSlZjMlZ5SUVFaUxDSnZhV1FpT2lJ' +
    'd01EQXdNREF4TFRFeE1URXRNVEV4TVMweE1URXhMVEV4TVRFeE1URXhNVEV4TVNJc0ltOX' +
    'VjSEpsYlY5emFXUWlPaUpUTFRFdE5TMHlNU0lzSW5Cc1lYUm1Jam9pTlNJc0luQjFhV1Fp' +
    'T2lJeE1URXhJaXdpZFc1cGNYVmxYMjVoYldVaU9pSjFjMlZ5WVVCemIyMWxaRzl0WVdsdU' +
    'xtTnZiU0lzSW5Wd2JpSTZJblZ6WlhKaFFITnZiV1ZrYjIxaGFXNHVZMjl0SW4wLllTN0l5' +
    'cVFEUlFMYWRWQjNMTHNLQTRhWXFpSkptZGdUQ1VRNXlNVmFTUkE=';
    const mockTestTkn = Buffer.from(testTknStr, 'base64').toString();

    const msalConfig = {
        clientId: 'CLIENT_ID',
        tenantId: 'TENANT_ID',
        certThumbprint: 'CERT_THUMB_PRINT',
        pvtKey: 'PRIVATE_KEY'
    };

    beforeAll(() => {
        jest.mock('../actions/utils', () => ({
            getAioLogger: () => ({
                info: jest.fn(),
                debug: jest.fn(),
                error: jest.fn(),
            }),
        }));

        jest.mock('@azure/msal-node', () => ({
            ConfidentialClientApplication: jest.fn().mockReturnValue({
                acquireTokenByClientCredential: jest.fn().mockResolvedValue({
                    accessToken: mockTestTkn
                })
            })
        }));
        SharepointAuth = require('../actions/sharepointAuth');
    });

    afterAll(() => {
        jest.clearAllMocks();
    });

    it('should extract user details', async () => {
        const sharepointAuth = new SharepointAuth(msalConfig);
        const at = await sharepointAuth.getAccessToken();
        expect(at).toEqual(mockTestTkn);
        const ud = await sharepointAuth.getUserDetails(at);
        expect(ud.oid).toEqual('0000001-1111-1111-1111-111111111111');
    });

    it('missing parameters in config', async () => {
        let uddMsalConfig = { ...msalConfig, clientId: '' };
        const errChk = /mandatory fields have not been configured/;
        expect(() => new SharepointAuth(uddMsalConfig)).toThrow(errChk);
        uddMsalConfig = { ...msalConfig, tenantId: '' };
        expect(() => new SharepointAuth(uddMsalConfig)).toThrow(errChk);
        uddMsalConfig = { ...msalConfig, certThumbprint: '' };
        expect(() => new SharepointAuth(uddMsalConfig)).toThrow(errChk);
        uddMsalConfig = { ...msalConfig, pvtKey: '' };
        expect(() => new SharepointAuth(uddMsalConfig)).toThrow(errChk);
    });

    it('should check the token expiry', async () => {
        const sharepointAuth = new SharepointAuth(msalConfig);
        const at = await sharepointAuth.getAccessToken();
        const exp = sharepointAuth.isTokenExpired(at);
        expect(exp).toBe(true);
    });
});
