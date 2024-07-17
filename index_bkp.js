const puppeteer = require("puppeteer");
const fs = require('fs');
const path = require('path');

async function getTxHash(page) {
  await page.waitForSelector('#spanTxHash', { visible: true, timeout: 5000 });
  const txHash = await page.$eval('#spanTxHash', el => el.textContent.trim());

  return txHash;
}

async function getMemo(page) {
  await page.waitForSelector(".link-collapse-default", { visible: true, timeout: 5000 });
  await page.click(".link-collapse-default > i");

  await page.waitForSelector("#btnconvert222_1", { visible: true, timeout: 5000 });
  await page.click("#btnconvert222_1");

  await page.waitForSelector("#convert_utf", { visible: true, timeout: 6000 });
  await page.click("#convert_utf");

  const getMemoData = await page.$eval("#inputdata", el => el.value);
  const memo = getMemoData.split("MEMO:")[1].trim();

  return memo;
}

async function getDate(page) {
  await page.waitForSelector("#showUtcLocalDate", { visible: true, timeout: 5000 });
  const date = await page.$eval("#showUtcLocalDate", el => el.textContent.trim());

  return date;
}

async function getHashesInFile() {
  const filePath = path.resolve(__dirname, 'hashes.txt');
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const hashes = fileContent.split('\n').map(line => line.replace(/"/g, '').trim()).filter(Boolean);

  return hashes;
}

async function registerFile(transactionData) {
  const outputFilePath = path.resolve(__dirname, 'output.txt');

  const dataToWrite = JSON.stringify(transactionData, null, 2);

  fs.appendFileSync(outputFilePath, dataToWrite + '\n');
}

async function getDataForHash(hash) {
  const browser = await puppeteer.launch({ headless: false, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security'] });
  const page = await browser.newPage();

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
  await page.setViewport({ width: 1280, height: 800 });
  page.setDefaultNavigationTimeout(60000);

  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  await page.goto(`https://polygonscan.com/tx/${hash}`);

  try {
    const txHash = await getTxHash(page);
    const memo = await getMemo(page);
    const date = await getDate(page);

    return {
      txHash,
      memo,
      date
    }

  } catch (error) {
    console.error('Erro durante a execução do script:', error);
    await page.screenshot({ path: 'error_screenshot.png' });
  }

  await browser.close();
}

async function start() {
  try {
    const hashes = await getHashesInFile();

    for (const hash of hashes) {
      const dataToFile = await getDataForHash(hash);

      registerFile(dataToFile)
    }

  } catch (error) {
    console.error(error);
  }
}

start();
