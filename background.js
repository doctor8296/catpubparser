
// importing necessary libraries
try {
  importScripts('./dom-parser.js');
  importScripts('./xlsx.js');
} catch (e) {
  console.error(e);
}

function generateFileName() {
  var currentDate = new Date();
  
  // Format the date and time components
  var year = currentDate.getFullYear();
  var month = String(currentDate.getMonth() + 1).padStart(2, '0'); // Months are zero-based
  var day = String(currentDate.getDate()).padStart(2, '0');
  var hours = String(currentDate.getHours()).padStart(2, '0');
  var minutes = String(currentDate.getMinutes()).padStart(2, '0');
  var seconds = String(currentDate.getSeconds()).padStart(2, '0');
  
  // Construct the file name using the date and time components
  var fileName = `${year}-${month}-${day}_${hours}-${minutes}-${seconds}_catpub.xlsx`;
  
  return fileName;
}

class Background {
  constructor() {
    this.running = false;
    this._onCrossFrameMessageCallback = null;
    this.parser = null
  }

  run() {
    if (this.running) {
      throw new Error('background is already running');   
    }
    this.running = true;
    this.openCrossFrameConnection();
    this.initParserState();
  }

  stop() {
    if (!this.running) {
      throw new Error('background is not running');   
    }
    this.running = true;
    this.closeCrossFrameConnection();
  }

  dispose() {
    this.stop();
  }

  initParserState() {
    chrome.storage.local.set({running: false});
  }

  initParser({
    formData,
    totalPages,
    page=0
  }) {
    console.log('initParser data:', {
      formData,
      totalPages,
      page
    });
    if (this.parser === null || this.parser.stopped) {
      this.parser = new Parser({
        formData: formData,
        totalPages: totalPages,
        page
      });
      this.parser.on('update', parser => chrome.storage.local.set({
        'formData': parser.formData,
        'running': parser.running,
        'ended': parser.ended,
        'page': parser.page,
        'totalPages': parser.totalPages,
        'stopped': parser.stopped,
        'stopReason': parser.stopReason
      }));
      this.parser.on('data', async data => {
          const result = await chrome.storage.local.get('cardsData');
          // console.trace();
          console.log('updatedCardsData:', 'cardsData' in result ? result.cardsData.concat(data.cardsData) : data.cardsData);
          await chrome.storage.local.set({'cardsData': ('cardsData' in result ? result.cardsData.concat(data.cardsData) : data.cardsData)});
        }
      );
      this.parser.on('end', () => console.log('Ended succesfully!'));
      this.parser.on('stop', reason => `Stopped with reason: ${reason}`);
      this.parser.start();
    } else {
      throw new Error('There is already active parser session');
    }
  }

  requestFormDataFromPage() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab) {
        chrome.scripting.executeScript({
          target: {tabId: activeTab.id, allFrames: false},
          files: ['content_get_form_data.js'],
        }, function() {
          console.log('content script was injected');
        });
      } else {
        throw new Error('No avaliable active tabs were found');
      }
    });
  }

  openCrossFrameConnection() {
    chrome.runtime.onMessage.addListener(this._onCrossFrameMessageCallback = (message, sender, sendResponse) => {
      const messageCommand = message.command;
      console.log('message recieved:', messageCommand);
      switch(messageCommand) {
        case "startParsing": {
          this.requestFormDataFromPage();
          break;
        }
        case "dataFromContentScript": {
          chrome.storage.local.clear().then(() => {
            console.log('storage cleared!');
            this.initParser(message.data);
          });
          break;
        }
        case "stopParsing": {
          this.parser.stop('interrupt');
          break;
        }
        case "restartParsing": {
          chrome.storage.local.set({'page': 0, 'cardsData': undefined}).then(() => {
            chrome.storage.local.get(null, result => this.initParser({...result}));
          });
          break;
        }
        case "continueParsing": {
          chrome.storage.local.get(null, result => this.initParser({...result}));
          break;
        }
        case "contentScriptError": {
          throw new Error(message.errorMessage);
        }
        case "downloadCardsData": {
          chrome.storage.local.get(['cardsData', 'formData'], ({cardsData, formData}) => {

            // Sample data representing a row as an array

            // Create a worksheet from the array (as a row)
            var ws = XLSX.utils.aoa_to_sheet(cardsData.map(row => [
              formData[2][1],
              formData.filter(([name, _]) => name === 'Categories.Index').map(([name, value]) => value).join('/'),
              formData.filter(([name, _]) => name.endsWith('.ProductFamilies')).map(([name, value]) => value).join('/'),
              formData.filter(([name, _]) => name === 'Languages').map(([name, value]) => value).join('/'),
              row.Language,
              row["Pub Type"],
              row["Serial Number"],
              row["Media Number"],
              row["Version"],
              row["Book"],
              row["CD"],
              row["Download"]
            ]));

            // Create a workbook and add the generated worksheet
            var wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

            // Convert workbook to a Blob object
            var wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });

            // Convert ArrayBuffer to base64 data URL
            var blob = new Blob([wbout], { type: 'application/octet-stream' });
            var reader = new FileReader();
            reader.onload = function (event) {
              var base64data = event.target.result;
              // Trigger download using chrome.downloads.download
              chrome.downloads.download({
                url: base64data,
                filename: generateFileName(),
                saveAs: true // To prompt for download location
              });
            };
            reader.readAsDataURL(blob);
          });
          break;
        }
        default: {
          throw new Error(`Unknown message type ${messageCommand}`);
        }
      }
      sendResponse(true);
      return true;
    });
  }

  closeCrossFrameConnection() {
    if (this._onCrossFrameMessageCallback === null) {
      throw new Error('Connection is already closed or was not opened yet');
    }
    chrome.runtime.onMessage.removeListener(this._onCrossFrameMessageCallback);
    this._onCrossFrameMessageCallback = null;
  }
}

class Eventor {
  constructor() {
    this._events = new Map();
  }

  on(name, callback) {
    if (!(this._events.has(name))) {
      this._events.set(name, new Set());
    }
    this._events.get(name).add(callback);
  }

  off(name, callback) {
    if (this._events.has(name)) {
      return this._events.get(name).delete(callback);
    }
    return false;
  }

  async dispatch(name, ...args) {
    if (this._events.has(name)) {
      for (const callback of this._events.get(name).values()) {
        if (callback.constructor.name === 'AsyncFunction') {
          await callback(...args)
        } else {
          const result = callback(...args);
          if (result instanceof Promise) {
            await result;
          }
        }
      }
    }
  }
}

class Parser extends Eventor {
  constructor({
    formData,
    page=0,
    totalPages,
    maxRetry=5
  }) {
    super();
    this.formData = formData;
    this.page = page;
    this.running = false;
    this.stopped = false;
    this.ended = false;
    this.retryAttemptNumber = 0;
    this.maxRetry = maxRetry;
    this.totalPages = totalPages;
    this.sessionItemsStorage = [];
    this.stopReason = null;
    this.sleeping = false;
  }

  async start() {
    this.running = true;
    await this.dispatch('update', this);
    while (this.page < this.totalPages) {
      const result = await this.getData(this.page);
      if (this.stopped) {
        throw new Error('Parser was stopped');
      }
      console.log('result:', result);
      switch (result.code) {
        case "request_error": 
        case "network_error": 
        case "parsing_error": {
          if (this.retryAttemptNumber < this.maxRetry) {
            console.log('Sleeping', 1e3 * 2 ** this.retryAttemptNumber);
            await this.sleep(1e3 * 2 ** this.retryAttemptNumber);
            if (this.stopped) {
              throw new Error('Parser was stopped');
            }
            const oldToken = this.formData[0][1];
            console.log('Old token:', oldToken);

            console.log('...requesting new token');
            const newToken = await this.requestNewToken();

            console.log('New token:', newToken);
            if (this.stopped) {
              throw new Error('Parser was stopped');
            }
            this.formData[0][1] = newToken ?? oldToken;
          } else {
            await this.stop('error', result);
            return;
          }
          this.retryAttemptNumber++;
          break;
        }
        case "success": {
          this.page++;
          this.retryAttemptNumber = 0;
          if (this.stopped) {
            throw new Error('Parser was stopped');
          }
          await this.dispatch('update', this);
          await this.dispatch('data', result);
          break;
        }
        default: {
          throw new Error(`Unexpected result code "${result.code}"`);
        }
      }
    }
    this.page--;
    await this.stop('end');
  }

  async requestNewToken() {
    try {
      const request = await fetch("https://catpublications.com/Search", {
        "headers": {
          "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
          "accept-language": "en",
          "cache-control": "no-cache",
          "pragma": "no-cache",
          "upgrade-insecure-requests": "1"
        },
        "referrerPolicy": "strict-origin-when-cross-origin",
        "body": null,
        "method": "GET",
        "mode": "cors",
        "credentials": "include"
      });
      const htmlText = await request.text();
      const dom = HTMLParser.parse(htmlText);
      console.log(
        'token element:',
        dom.querySelector('form#searchForm>[name="__RequestVerificationToken"]')
      );
      return dom.querySelector('form#searchForm>[name="__RequestVerificationToken"]')?.attributes?.value;
    } catch (error) {
      console.log('requestNewToken-Error', error);
      return null;
    }
  }

  sleep(ms) {
    this.sleeping = true;
    return new Promise(resolve => setTimeout(() => {
      this.sleeping = false;
      resolve();
    }, ms));
  }

  async getData(page) {
    console.log('form data', this.formData);

    const body = this.formData
    .map(([name, value]) => [name, name === 'PageNumber' ? page : value])
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
    .join('&');

    console.log('body form data:', body);

    try {

      const request = await fetch("https://catpublications.com/Search/TokenSearch", {
        "headers": {
          "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
        "referrer": "https://catpublications.com/Search",
        "referrerPolicy": "strict-origin-when-cross-origin",
        "body": body,
        "method": "POST",
      });

      console.log(`TokenSearch request status: ${request.status}`);

      if (!request.ok) {
        return {
          code: "request_error",
          request
        };
      }

      try {

        const htmlText = await request.text();
        const dom = HTMLParser.parse(htmlText);
        const cards = dom.querySelectorAll('#SearchResults .card');
        const cardsData = [...cards].map(card => ({
          header: card.querySelector('div.card-header')?.textContent?.trim?.() || "",
          Language: card.querySelector('td[data-i18n="resource:SearchFilterLanguageEnglish"]')?.textContent || "",
          "Pub Type": card.querySelector('.table-label:has([data-i18n="resource:MetadataPubType"]) ~ td')?.textContent || "",
          "Serial Number": card.querySelector('[data-i18n="resource:MetadataSecondaryTitle"] ~ td')?.textContent || "",
          "Media Number": card.querySelector('[data-i18n="resource:MetadataProductName"] ~ td')?.textContent || "",
          Version: card.querySelector('[data-i18n="resource:MetadataVersion"] ~ td')?.textContent || "",
          Book: card.querySelector('.col-xs-3:has([data-i18n="resource:GlobalFormatBook"]) ~ .price-block')?.textContent?.trim?.() || "",
          CD: card.querySelector('.col-xs-3:has([data-i18n="resource:GlobalFormatCD"]) ~ .price-block')?.textContent?.trim?.() || "",
          Dowload: card.querySelector('.col-xs-3:has([data-i18n="resource:GlobalFormatDownload"]) ~ .price-block')?.textContent?.trim?.()  || ""
        }));

        return {
          code: "success",
          cardsData
        };

      } catch (error) {
        console.error(error);
        return {
          code: "parsing_error",
          error
        };
      }

    } catch (error) {
      return {
        code: "network_error",
        error
      }
    }
  }

  pause() {
    this.stop('pause');
  }

  async stop(reason) {
    if (!this.running) {
      throw new Error('Parser is not running');
    }
    this.running = false;
    this.stopped = true;
    this.stopReason = reason;
    console.log('stopReason:', reason);
    switch (reason) {
      case 'end': {
        this.ended = true;
        await this.dispatch('end', this);
        break;
      }
    }
    await this.dispatch('stop', reason);
    await this.dispatch('update', this);
  }
}


const background = new Background();
background.run();

console.log('catpubparser made by doctor8296 :3', background);