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
const events = require('events');

describe('utils', () => {
    let utils = null;

    beforeAll(() => {
        jest.mock('@adobe/aio-lib-core-logging', () => (() => ({
            info: jest.fn(),
            debug: jest.fn(),
            error: jest.fn(),
        })));
        utils = require('../actions/utils');
    });

    afterAll(() => {
        jest.clearAllMocks();
    });

    describe('handleExtension', () => {
        test('docx path', () => {
            expect(utils.handleExtension('/path/to/file.docx')).toEqual('/path/to/file');
        });
        test('xlsx path', () => {
            expect(utils.handleExtension('/path/to/file.xlsx')).toEqual('/path/to/file.json');
        });
        test('svg path', () => {
            expect(utils.handleExtension('/path/to/file.svg')).toEqual('/path/to/file.svg');
        });
        test('docx path', () => {
            expect(utils.handleExtension('/path/to/index.docx')).toEqual('/path/to/');
        });
        test('files with caps in path', () => {
            expect(utils.handleExtension('/path/to/Sample.docx')).toEqual('/path/to/sample');
        });
        test('files with space in path', () => {
            expect(utils.handleExtension('/path/to/sample test.docx')).toEqual('/path/to/sample-test');
        });
        test('files with space in path', () => {
            expect(utils.handleExtension('/path/to/Sample_Test.docx')).toEqual('/path/to/sample-test');
        });
        test('file in root path', () => {
            expect(utils.handleExtension('/Sample_Test.docx')).toEqual('/sample-test');
        });
        test('file without extension', () => {
            expect(utils.handleExtension('/Sample_Test')).toEqual('/sample-test');
        });
    });

    describe('strToArray', () => {
        const td1 = ['a', 'b', 'c'];
        test('str to array', () => {
            expect(utils.strToArray('a,b,c')).toEqual(td1);
        });
        test('str to array with array input', () => {
            expect(utils.strToArray(td1)).toEqual(td1);
        });
    });

    describe('toUTCStr', () => {
        test('iso string', () => {
            expect(utils.toUTCStr('2023-11-07T07:00:33.462Z')).toEqual('Tue, 07 Nov 2023 07:00:33 GMT');
        });
        test('iso date', () => {
            expect(utils.toUTCStr(new Date('2023-11-07T07:00:33.462Z'))).toEqual('Tue, 07 Nov 2023 07:00:33 GMT');
        });
        test('utc string', () => {
            expect(utils.toUTCStr('Tue, 07 Nov 2023 07:00:33 GMT')).toEqual('Tue, 07 Nov 2023 07:00:33 GMT');
        });
        test('another string', () => {
            expect(utils.toUTCStr('2023-NOV-07 07:00:33 AM GMT')).toEqual('Tue, 07 Nov 2023 07:00:33 GMT');
        });
        test('empty string', () => {
            expect(utils.toUTCStr('')).toEqual('');
        });
        test('no val', () => {
            expect(utils.toUTCStr()).toEqual(undefined);
        });
    });

    describe('isFilePathWithWildcard', () => {
        test('matches exact file path', () => {
            expect(utils.isFilePathWithWildcard('/path/to/file.txt', '/path/to/file.txt')).toBe(true);
        });

        test('matches file path with wildcard', () => {
            expect(utils.isFilePathWithWildcard('/path/to/directory/', '/path/to/*')).toBe(true);
        });

        test('matches file with wildcard extension', () => {
            expect(utils.isFilePathWithWildcard('file_with_space.txt', '*.txt')).toBe(true);
        });

        test('match a prefix wild card', () => {
            expect(utils.isFilePathWithWildcard('/drafts/a/query-index.xlsx', '*/query-index.xlsx')).toBe(true);
            expect(utils.isFilePathWithWildcard('/drafts/b/query-index.xlsx', '*/query-index.xlsx')).toBe(true);
            expect(utils.isFilePathWithWildcard('/drafts/b/c/query-index.xlsx', '*/query-index.xlsx')).toBe(true);
        });

        test('matches dot files', () => {
            expect(utils.isFilePathWithWildcard('/.milo', '/.milo')).toBe(true);
            expect(utils.isFilePathWithWildcard('/amilo', '/.milo')).toBe(false);
        });
    });

    describe('isFilePatternMatched', () => {
        const patterns = ['/.milo', '/.helix', '/metadata.xlsx', '/a/Caps', '*/query-index.xlsx'];
        test('matches a set of file', () => {
            expect(utils.isFilePatternMatched('/.helix', patterns)).toBe(true);
            expect(utils.isFilePatternMatched('/a/Caps', patterns)).toBe(true);
            expect(utils.isFilePatternMatched('/a/Caps/Test', patterns)).toBe(true);
            expect(utils.isFilePatternMatched('/a/ACaps/Test', patterns)).toBe(false);
            expect(utils.isFilePatternMatched('/a/query-index.xlsx', patterns)).toBe(true);
            expect(utils.isFilePatternMatched('/a/b/query-index.xlsx', patterns)).toBe(true);
        });
    });

    describe('strToBool', () => {
        test('Check for a set of true and false inputs', () => {
            expect(utils.strToBool('true')).toBeTruthy();
            expect(utils.strToBool('TRUE')).toBeTruthy();
            expect(utils.strToBool(true)).toBeTruthy();
            expect(utils.strToBool('false')).not.toBeTruthy();
            expect(utils.strToBool('FALSE')).not.toBeTruthy();
            expect(utils.strToBool(false)).not.toBeTruthy();
            expect(utils.strToBool('something')).not.toBeTruthy();
            expect(utils.strToBool('')).not.toBeTruthy();
            expect(utils.strToBool(null)).not.toBeTruthy();
            expect(utils.strToBool(undefined)).not.toBeTruthy();
        });
    });

    describe('getDocPathFromUrl', () => {
        test('Check extension handling', () => {
            expect(utils.getDocPathFromUrl('https://sp/path/file')).toEqual('/path/file.docx');
            expect(utils.getDocPathFromUrl('https://sp/path/file.json')).toEqual('/path/file.xlsx');
            expect(utils.getDocPathFromUrl('https://sp/path/file.svg')).toEqual('/path/file.svg');
            expect(utils.getDocPathFromUrl('https://sp/path/file.pdf')).toEqual('/path/file.pdf');
            expect(utils.getDocPathFromUrl('https://sp/path/')).toEqual('/path/index.docx');
            expect(utils.getDocPathFromUrl('https://sp/path/file.html')).toEqual('/path/file.docx');
        });
    });

    describe('getInstanceKey', () => {
        test('Check instance key cleanup', () => {
            expect(utils.getInstanceKey({ fgRootFolder: 'Clean-Up%20This_123' })).toEqual('Clean_Up_20This_123');
        });
    });

    describe('logMemUsageIter', () => {
        test('Check instance key cleanup', () => {
            const onMock = jest.spyOn(events.EventEmitter.prototype, 'on');
            utils.logMemUsageIter();
            expect(onMock).toHaveBeenCalled();
        });
    });

    describe('actInProgress', () => {
        test('should return true when svInProg is true, actId is not null, and activation status is null', async () => {
            const ow = {};
            const actId = '123';
            const svInProg = true;
            const result = await utils.actInProgress(ow, actId, svInProg);
            expect(result).toBe(true);
        });

        test('should return false when svInProg is false and actId is provided', async () => {
            const ow = {};
            const actId = '123';
            const svInProg = false;
            const result = await utils.actInProgress(ow, actId, svInProg);
            expect(result).toBe(false);
        });
    });

    describe('errorResponse', () => {
        test('error response is built', async () => {
            const er = utils.errorResponse(401, 'Auth Error');
            expect(er).toEqual({ error: { statusCode: 401, body: { error: 'Auth Error' } } });
        });
    });
});
