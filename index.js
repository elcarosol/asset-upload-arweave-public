const arweave = require('arweave');
const fs = require('fs');
const got = require('got');

const dir = "./assets/"
const cacheFilePath = "./cache.json"
const fileExtension = '.json';
const mimeType = 'application/json';

const createCachedMetadata = () => {
  return {
    "program": {
      "uuid": "Change Me", //Change Me - first 6 of wallet address
      "config": "Change Me" //Change Me - wallet address
    },
    "items": {}
  };
}

const restoreCachedMetadata = () => {
  return JSON.parse((fs.readFileSync(cacheFilePath).toString()));
};

const arweaveConnection = arweave.init({
  host: 'arweave.net',
  port: 443,
  protocol: 'https',
  timeout: 20000,
});
const arweaveWallet = JSON.parse(fs.readFileSync('./arweave.json'));

const uploadFile = async (data) => {
  const anchor = await arweaveConnection.api.get('tx_anchor');
  const anchorData = anchor.data;
  const transaction = await arweaveConnection.createTransaction(
    { data: data, last_tx: anchorData },
    arweaveWallet,
  );
  transaction.addTag('Content-Type', mimeType);
  await arweaveConnection.transactions.sign(transaction, arweaveWallet);
  let uploader = await arweaveConnection.transactions.getUploader(
    transaction,
  );
  while (!uploader.isComplete) {
    await uploader.uploadChunk();
  }
  console.log(fileName, transaction.id);
  return transaction.id;
};

const attachFileUrl = (filePath, transactionID) => {
  const metadataPath = filePath.replace(fileExtension, '.json');
  const metadata = JSON.parse(fs.readFileSync(metadataPath));
  const fileUrl = 'https://arweave.net/' + transactionID
  metadata['image'] = fileUrl;
  metadata['properties']['files'].push({
    'uri': fileUrl,
    'type': mimeType
  });
  fs.writeFileSync(metadataPath, JSON.stringify(metadata));
};

const attachMetadataUrl = (metadata, fileName, transactionID) => {
  const fileUrl = 'https://arweave.net/' + transactionID
  const fileNameNoExt = fileName.replace(dir, '').replace(fileExtension, '');
  metadata['items'][fileNameNoExt] = {
    'link': fileUrl,
    'name': `REPLACEME #${String(fileNameNoExt).padStart(4, '0')}`, //replace name
    'onChain': false
  };
};

const uploadFilesAndAttachUrl = async () => {
  const files = fs.readdirSync(dir);
  for (i = 0; i < files.length; i++) {
    fileName = dir + files[i];
    if (!fileName.endsWith(fileExtension)) continue;
    const fileData = fs.readFileSync(fileName);
    const transactionID = await uploadFile(fileData);
    attachFileUrl(fileName, transactionID);
  }
}

const uploadFilesAndCreateMetadata = async () => {
  const metadata = restoreCachedMetadata();
  if (!metadata) createCachedMetadata();
  console.log(metadata);
  const files = fs.readdirSync(dir);
  for (i = 0; i < files.length; i++) {
    fileName = dir + files[i];
    if (!fileName.endsWith(fileExtension)) continue;
    if (metadata['items'][fileName.replace(dir, '').replace(fileExtension, '')]) continue;
    const fileData = fs.readFileSync(fileName);
    const transactionID = await uploadFile(fileData);
    attachMetadataUrl(metadata, fileName, transactionID);
    if (i % 10 == 0) {
      fs.writeFileSync(cacheFilePath, JSON.stringify(metadata));
    }
  }
  fs.writeFileSync(cacheFilePath, JSON.stringify(metadata));
};

const verifyUploadedFiles = async () => {
  const files = fs.readdirSync(dir);
  const metadata = restoreCachedMetadata();
  for (i = 0; i < files.length; i++) {
    metadataFileName = dir + files[i];
    if (!metadataFileName.endsWith(fileExtension)) continue;
    const rawJsonData = fs.readFileSync(metadataFileName).toString();
    const jsonData = JSON.parse(rawJsonData);
    let response = await got(jsonData['image']);
    const dataFileName = metadataFileName.replace(fileExtension, '.png');
    const fileData = fs.readFileSync(dataFileName).toString();
    if (fileData !== response.body) {
      console.log(dataFileName, "failed verification!");
    } else {
      console.log(dataFileName, 'checks out!');
    }
    const metadataLink = metadata['items'][metadataFileName.replace(dir, '').replace(fileExtension, '')]['link'];
    response = await got(metadataLink);
    if (rawJsonData !== response.body) {
      console.log(metadataFileName, "failed verification!");
    } else {
      console.log(metadataFileName, 'checks out!');
    }
  }
};

(async () => {
  verifyUploadedFiles();
})();