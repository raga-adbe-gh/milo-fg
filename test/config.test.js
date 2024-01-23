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

const utils = require('../actions/utils');

test('interface', () => {
    expect(typeof utils.handleExtension).toBe('function');
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
