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

describe('BatchManager', () => {
    Batch = null;
    BatchManager = null;
    params = {
        key: 'promoteAction',
        instanceKey: 'milo-pink',
        batchConfig: { maxFilesPerBatch: 10, batchFilesPath: '/floodgate' },
    };

    beforeAll(() => {
        jest.mock('../actions/utils', () => ({
            getAioLogger: () => ({
                info: jest.fn(),
                debug: jest.fn(),
                error: jest.fn(),
            }),
        }));

        jest.mock('@adobe/aio-lib-files', () => ({
            init: jest.fn().mockResolvedValue({
                read: jest.fn(),
                write: jest.fn(),
            }),
        }));

        Batch = require('../actions/batch');
        BatchManager = require('../actions/batchManager');
    });

    afterAll(() => {
        jest.clearAllMocks();
    });

    // BatchManager can be initialized with or without params
    it('should initialize BatchManager without params', () => {
        const batchManager = new BatchManager(params);
        expect(batchManager.params).toEqual(params);
        expect(batchManager.batches).toEqual([]);
        expect(batchManager.batchFilesPath).toEqual('/floodgate');
        expect(batchManager.key).toEqual('promoteAction');
        expect(batchManager.bmPath).toEqual('/floodgate/promoteAction');
        expect(batchManager.bmTracker).toEqual(
            '/floodgate/promoteAction/tracker.json'
        );
        expect(batchManager.instanceKey).toEqual('milo-pink');
        expect(batchManager.instancePath).toEqual(
            '/floodgate/promoteAction/instancemilo-pink'
        );
        expect(batchManager.instanceFile).toEqual(
            '/floodgate/promoteAction/instancemilo-pink/instance_info.json'
        );
        expect(batchManager.resultsFile).toEqual(
            '/floodgate/promoteAction/instancemilo-pink/instance_results.json'
        );
    });

    // BatchManager can initialize a batch with a batchNumber
    it('should initialize a batch with a batchNumber', () => {
        const newParams = { ...params, batchNumber: 1 };
        const batchManager = new BatchManager(params);
        batchManager.initBatch(newParams);
        expect(batchManager.currentBatchNumber).toBe(1);
        expect(batchManager.currentBatch).toBeInstanceOf(Batch);
        expect(batchManager.batches).toHaveLength(1);
    });

    // BatchManager can read the bmTracker file
    it('should read the bmTracker file', async () => {
        const filesSdkMock = {
            read: jest
                .fn()
                .mockResolvedValue(
                    Buffer.from(JSON.stringify({ instanceKeys: ['key1', 'key2'] }))
                ),
        };
        const batchManager = new BatchManager(params);
        batchManager.filesSdk = filesSdkMock;
        const result = await batchManager.readBmTracker();
        expect(result).toEqual({ instanceKeys: ['key1', 'key2'] });
        expect(filesSdkMock.read).toHaveBeenCalledWith(
            '/floodgate/promoteAction/tracker.json'
        );
    });

    // BatchManager can handle errors while reading bmTracker file
    it('should handle errors while reading bmTracker file', async () => {
        const filesSdkMock = {
            read: jest.fn().mockRejectedValue(new Error('Read error')),
        };
        const batchManager = new BatchManager(params);
        batchManager.filesSdk = filesSdkMock;
        const result = await batchManager.readBmTracker();
        expect(result).toEqual({});
    });

    // BatchManager can handle errors while writing to bmTracker file
    it('should write to bmTracker file', async () => {
        const filesSdkMock = {
            read: jest
                .fn()
                .mockResolvedValue(
                    Buffer.from(JSON.stringify({ instanceKeys: ['key1', 'key2'] }))
                ),
            write: jest.fn(),
        };
        const batchManager = new BatchManager(params);
        batchManager.filesSdk = filesSdkMock;
        await batchManager.writeToBmTracker({ data: 'test' });
        expect(filesSdkMock.write).toHaveBeenCalledWith(
            '/floodgate/promoteAction/tracker.json',
            JSON.stringify({
                instanceKeys: ['key1', 'key2', 'milo-pink'],
                data: 'test',
            })
        );
    });

    // BatchManager can handle errors while writing to instance file
    it('should write to instance file', async () => {
        const filesSdkMock = {
            write: jest.fn(),
        };
        const batchManager = new BatchManager(params);
        batchManager.filesSdk = filesSdkMock;
        await batchManager.writeToInstanceFile({ data: 'test' });
        expect(filesSdkMock.write).toHaveBeenCalledWith(
            '/floodgate/promoteAction/instancemilo-pink/instance_info.json',
            JSON.stringify({ data: 'test' })
        );
    });

    it('Add to instance file', async () => {
        const fileData =
        '{"lastBatch":1,"dtls":{"0":{"batchNunber":1,"activationId":"a"},"data":"test"}}';
        const writtenData =
        '{"lastBatch":1,"dtls":{"0":{"batchNunber":1,"activationId":"a"},"data":"test"}}';
        const filesSdkMock = {
            read: () => fileData,
            write: jest.fn(),
        };
        const batchManager = new BatchManager(params);
        batchManager.filesSdk = filesSdkMock;
        await batchManager.addToInstanceFile({ data: 'test' });
        expect(filesSdkMock.write).toHaveBeenCalledWith(
            '/floodgate/promoteAction/instancemilo-pink/instance_info.json',
            writtenData
        );
    });

    it('should return instance data when instance key is found in tracker.json and proceed is true', async () => {
        const batchManager = new BatchManager(params);
        batchManager.init({});
        const readBmTrackerMock = jest
            .spyOn(batchManager, 'readBmTracker')
            .mockResolvedValue({
                instanceKeys: ['_milo_pink'],
                _milo_pink: { done: false, proceed: true },
            });
        const initInstanceMock = jest
            .spyOn(batchManager, 'initInstance')
            .mockReturnValue(batchManager);
        const getInstanceFileContentMock = jest
            .spyOn(batchManager, 'getInstanceFileContent')
            .mockResolvedValue({ data: 'instance data' });

        const instanceData = await batchManager.getInstanceData();

        expect(readBmTrackerMock).toHaveBeenCalled();
        expect(initInstanceMock).toHaveBeenCalledWith({
            instanceKey: '_milo_pink',
        });
        expect(getInstanceFileContentMock).toHaveBeenCalled();
        expect(instanceData).toEqual({ data: 'instance data' });
    });

    it('should save pending files in the batch when currentBatch is not null', async () => {
        // Arrange
        const batchManager = new BatchManager(params);
        await batchManager.init({});
        const currentBatchMock = {
            savePendingFiles: jest.fn(),
        };
        batchManager.currentBatch = currentBatchMock;

        // Act
        await batchManager.finalizeInstance();

        // Assert
        expect(currentBatchMock.savePendingFiles).toHaveBeenCalled();
    });
    it('should mark the instance as complete', async () => {
        // Arrange
        const batchManager = new BatchManager(params);
        await batchManager.init({});
        const writeToBmTrackerMock = jest.spyOn(batchManager, 'writeToBmTracker');

        // Act
        await batchManager.markComplete();

        // Assert
        expect(writeToBmTrackerMock).toHaveBeenCalledWith({
            [`${batchManager.instanceKey}`]: {
                done: true,
                proceed: false,
            },
        });
    });
    it('should return parsed JSON data when files are present in the results file', async () => {
        const batchManager = new BatchManager(params);
        await batchManager.init(params);
        const mockFileProps = [{ name: 'results.json' }];
        const mockData = { file1: 'data1', file2: 'data2' };
        const mockBuffer = Buffer.from(JSON.stringify(mockData));
        batchManager.filesSdk.list = jest.fn().mockResolvedValue(mockFileProps);
        batchManager.filesSdk.read = jest.fn().mockResolvedValue(mockBuffer);
        const results = await batchManager.getResultsContent();
        expect(results).toEqual(mockData);
    });

    it('should delete all files in the current action instance path', async () => {
        // Arrange
        const batchManager = new BatchManager(params);
        const filesSdkMock = {
            delete: jest.fn().mockResolvedValue(),
        };
        batchManager.filesSdk = filesSdkMock;

        // Act
        await batchManager.cleanupFiles();

        // Assert
        expect(filesSdkMock.delete).toHaveBeenCalledWith(
            '/floodgate/promoteAction/instancemilo-pink/'
        );
    });

    it('should return the current batch if it exists', async () => {
        // Arrange
        const newParams = { ...params, batchNumber: 2 };
        const batchManager = new BatchManager(newParams);
        await batchManager.init(newParams);
        const currentBatch = await batchManager.getCurrentBatch();

        // Assert
        expect(currentBatch.getBatchNumber()).toBe(2);
    });

    // Adds file metadata to current batch if it can still add files
    it('should add file metadata to current batch if it can still add files', async () => {
        // Arrange
        const newParams = { ...params, batchNumber: 1 };
        const batchManager = new BatchManager(params);
        await batchManager.init(newParams);
        const file = 'path/to/file.txt';
        jest.spyOn(Batch.prototype, 'canAddFile').mockResolvedValue(true);
        const addFileMock = jest.spyOn(BatchManager.prototype, 'addFile');
        const currentBatch = batchManager.getCurrentBatch();

        // Act
        await batchManager.addFile(file);

        // Assert
        expect(addFileMock).toHaveBeenCalledWith(file);
    });

    // Creates a new batch and adds file metadata if current batch is full and retry count is 0
    it('should create a new batch and add file metadata if current batch is full and retry count is 0', async () => {
        // Arrange
        const batchManager = new BatchManager(params);
        await batchManager.init({});
        const file = 'path/to/file.txt';
        jest.spyOn(Batch.prototype, 'canAddFile').mockResolvedValue(true);
        const createBatchMock = jest.spyOn(BatchManager.prototype, 'createBatch');
        const addFileMock = jest.spyOn(BatchManager.prototype, 'addFile');

        // Act
        await batchManager.addFile(file, 0);

        // Assert
        expect(createBatchMock).toHaveBeenCalled();
        expect(addFileMock).toHaveBeenCalledWith(file, 1);
    });
});
