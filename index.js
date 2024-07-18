const puppeteer = require("puppeteer");
const fs = require('fs');
const path = require('path');
const { parse } = require('json2csv');


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

async function getFrom(page) {
  await page.waitForSelector("#ContentPlaceHolder1_maintable");
  const content = await page.$eval("#ContentPlaceHolder1_maintable > div.card.p-5.mb-3 > div:nth-child(10) > div.col-md-9 > div > span > a", el => el.textContent);

  return content;
}

async function getTo(page) {
  await page.waitForSelector("#ContentPlaceHolder1_maintable");
  const content = await page.$eval("#ContentPlaceHolder1_maintable > div.card.p-5.mb-3 > div:nth-child(11) > div.col-md-9 > div > div > span > a", el => el.textContent);

  return content;
}

async function getQuantity(page) {
  await page.waitForSelector("#ContentPlaceHolder1_maintable");

  const content = await page.$eval("#wrapperContent > div > div > span:nth-child(2)", el => el.textContent);

  return content;
}


async function getHashesInFile() {
  const filePath = path.resolve(__dirname, 'hashes.txt');
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const hashes = fileContent.replace(/\\n/g, "").replace(/^"|"$/g, '');

  return JSON.parse(hashes);
}

async function registerFile(filename, newData) {
  const filePath = path.join(__dirname, filename);

  // Ler o conteúdo existente do arquivo, se ele existir
  let existingData = [];

  if (fs.existsSync(filePath)) {
    const fileContent = fs.readFileSync(filePath, 'utf-8');

    if (fileContent) {
      existingData = JSON.parse(fileContent);
    }
  }

  const updatedData = existingData.concat(newData);

  fs.writeFileSync(filePath, JSON.stringify(updatedData, null, 2), 'utf-8');
  console.log(`Data saved to ${filename}`);
}

async function registerCSV(outputFilePath, transactionData) {
  try {
    let csv = '';

    if (fs.existsSync(outputFilePath)) {
      csv = fs.readFileSync(outputFilePath, 'utf-8');
    } else {
      csv = 'Type,From,To,Quantity,App,Date,Transaction Hash,Memo\n';
    }

    const csvData = parse(transactionData, { header: false }) + '\n';

    csv += csvData;

    fs.writeFileSync(outputFilePath, csv);

    console.log(`Dados da transação adicionados em ${outputFilePath}`);
  } catch (error) {
    console.error('Erro ao registrar dados no arquivo CSV:', error);
  }
}

async function clearFiles() {
  const hashesFilePath = path.join(__dirname, 'hashes.txt');
  const csvFilePath = path.join(__dirname, 'output.csv');

  if (fs.existsSync(hashesFilePath)) {
    fs.writeFileSync(hashesFilePath, '', 'utf-8');
    console.log(`Cleared ${hashesFilePath}`);
  }

  if (fs.existsSync(csvFilePath)) {
    fs.unlinkSync(csvFilePath);
    console.log(`Deleted ${csvFilePath}`);
  }
}

async function getDataForHash(hash) {
  const browser = await puppeteer.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--ignore-certificate-errors',
    ]
  });

  const page = await browser.newPage();

  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });
    page.setDefaultNavigationTimeout(60000);

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));

    await page.goto(`https://polygonscan.com/tx/${hash}`);

    let retryCount = 0;

    let type, from, to, app, date, txHash, memo, quantity;

    while (
      !txHash
      || !memo
      || !date
      || !type
      || !from
      || !to
      || !app
      || !quantity
    ) {
      try {
        if (!txHash) {
          txHash = await getTxHash(page);
        }

        if (!memo) {
          memo = await getMemo(page);
        }

        if (!date) {
          date = await getDate(page);
        }

        if (!type) {
          // type = await getType(page);
          type = "FALTA ESSE"
        }

        if (!from) {
          from = await getFrom(page);
        }

        if (!to) {
          to = await getTo(page);
        }

        if (!app) {
          app = "FALTA ESSE"
        }

        if (!quantity) {
          quantity = await getQuantity(page);
        }

      } catch (error) {
        console.error('Erro ao obter dados:', error);
      }

      if (!txHash
        || !memo
        || !date
        || !type
        || !from
        || !to
        || !app
        || !quantity
      ) {
        retryCount++;
        console.log(`Tentando novamente (${retryCount})...`);
        await page.reload({ waitUntil: ["domcontentloaded", "networkidle0"] });
      }

      if (retryCount >= 5) {
        registerFile("abortados.txt", hash);

        console.error(`Falha após ${retryCount} tentativas. Abortando.`);
        break;
      }
    }


    if (
      txHash && memo && date && type && from && to && app && quantity
    ) {

      const transactionData = [{
        Type: type,
        From: from,
        To: to,
        Quantity: quantity,
        App: app,
        Date: date,
        'Transaction Hash': txHash,
        Memo: memo
      }];


      const outputFilePath = `output.csv`;

      await registerCSV(outputFilePath, transactionData);

      console.log(`Dados da transação adicionados`);
    }

  } catch (error) {
    console.error('Erro durante a execução do script:', error);
    await page.screenshot({ path: 'error_screenshot.png' });
  } finally {
    await browser.close();
  }
}

async function getAllTransactions(pageNumber = 1) {
  const browser = await puppeteer.launch({ headless: true });

  const page = await browser.newPage();

  try {
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    await page.setViewport({ width: 1280, height: 800 });
    page.setDefaultNavigationTimeout(60000);

    page.on('console', msg => console.log(`getAllTransactions: `, msg.text()));

    const url = `https://polygonscan.com/tokentxns?a=0xfd04f99486a43631252f77e6114809c7826288a8&ps=100&p=${pageNumber}`;
    await page.goto(url);

    const transactionHashes = await page.evaluate(() => {
      const today = new Date().toISOString().split('T')[0];
      const rows = document.querySelectorAll('table tbody tr');
      const hashes = [];
      let allToday = true;

      rows.forEach(row => {
        const dateCell = row.querySelector("td:nth-child(5) span");
        const hashCell = row.querySelector('td:nth-child(2) a');

        if (dateCell && hashCell) {
          const dateText = dateCell.innerHTML.split(" ")[0];

          if (dateText && dateText.startsWith(today)) {
            hashes.push(hashCell.textContent.trim());
          } else {
            allToday = false;
          }
        }
      });

      return { hashes: hashes.filter(item => item !== ""), allToday };
    });

    await registerFile("hashes.txt", transactionHashes.hashes);

    if (transactionHashes.allToday) {
      await getAllTransactions(pageNumber + 1);
    }

  } catch (error) {
    console.log("error", error);
  } finally {
    await browser.close();
  }
}

async function start() {
  try {

    await clearFiles();

    await getAllTransactions(1);

    const hashes = await getHashesInFile();

    for (const hash of hashes) {
      await getDataForHash(hash);
    }

  } catch (error) {
    console.error(error);
  }
}


start();