const puppeteer = require("puppeteer");
const fs = require('fs');
const path = require('path');

async function getTxHash(page) {
  await page.waitForSelector('#spanTxHash');
  const txHash = await page.$eval('#spanTxHash', el => el.textContent.trim());
  return txHash;
}

async function getMemo(page) {
  await page.waitForSelector(".link-collapse-default");
  await page.click(".link-collapse-default > i");

  await page.waitForSelector("#btnconvert222_1");
  await page.click("#btnconvert222_1");

  await page.waitForSelector("#convert_utf");
  await page.click("#convert_utf");

  const getMemoData = await page.$eval("#inputdata", el => el.value);
  const memo = getMemoData.split("MEMO:")[1]?.trim(); // Usando optional chaining (?.) para tratar caso seja undefined
  return memo;
}

async function getDate(page) {
  await page.waitForSelector("#showUtcLocalDate");
  const date = await page.$eval("#showUtcLocalDate", el => el.textContent.trim());
  return date;
}

async function getHashesInFile() {
  const filePath = path.resolve(__dirname, 'hashes.txt');
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const hashes = fileContent.split('\n').map(line => line.replace(/"/g, '').trim()).filter(Boolean);
  return hashes;
}

async function getDataForHash(hash) {
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();

  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });
    page.setDefaultNavigationTimeout(60000);

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    await page.goto(`https://polygonscan.com/tx/${hash}`);

    let retryCount = 0;
    let txHash, memo, date;

    while (!txHash || !memo || !date) {
      try {
        if (!txHash) txHash = await getTxHash(page);
        if (!memo) memo = await getMemo(page);
        if (!date) date = await getDate(page);
      } catch (error) {
        console.error('Erro ao obter dados:', error);
      }

      if (!txHash || !memo || !date) {
        retryCount++;
        console.log(`Tentando novamente (${retryCount})...`);
        await page.reload({ waitUntil: ["domcontentloaded", "networkidle0"] });
      }

      if (retryCount >= 3) {
        console.error(`Falha após ${retryCount} tentativas. Abortando.`);
        break;
      }
    }

    if (txHash && memo && date) {
      const transactionData = {
        txHash,
        memo,
        date
      };

      const outputFilePath = path.resolve(__dirname, 'output.txt');
      const dataToWrite = JSON.stringify(transactionData, null, 2) + '\n';
      fs.appendFileSync(outputFilePath, dataToWrite);
      console.log(`Dados da transação adicionados em ${outputFilePath}`);
    }

  } catch (error) {
    console.error('Erro durante a execução do script:', error);
    await page.screenshot({ path: 'error_screenshot.png' });
  } finally {
    await browser.close();
  }
}

async function start() {
  try {
    const hashes = await getHashesInFile();

    for (const hash of hashes) {
      await getDataForHash(hash);
    }

  } catch (error) {
    console.error(error);
  }
}

start();
