class Popup {
    constructor() {}

    init() {
        this.setReloadListener();
        this.setActionListener();
        this.setStateListener();
        this.initLinks();
        this.triggerUpdate();
    }

    initLinks() {
      document.addEventListener('DOMContentLoaded', function () {
        var links = document.getElementsByTagName("a");
        for (var i = 0; i < links.length; i++) {
            (function () {
                var ln = links[i];
                var location = ln.href;
                ln.onclick = function () {
                    chrome.tabs.create({active: true, url: location});
                };
            })();
        }
      });
    }

    setReloadListener() {
      const reloadButton = document.getElementById('reload');
      reloadButton.onclick = () => {
        chrome.runtime.reload();
      }
    }

    setActionListener() {
        const controls = document.getElementById('controls');
        controls.onclick = function(event) {
            const button = event.target;
            if (!button.matches('.action')) {
                return;
            }
            const action = button.dataset.action;
            console.log(action);
            chrome.runtime.sendMessage({ command: action }, (response) => {
                console.log("Received response from background:", response);
            });
        }
    }

    setStateListener() {
        chrome.storage.onChanged.addListener(this.triggerUpdate.bind(this));
    }

    triggerUpdate() {
        chrome.storage.local.get(null, this.update.bind(this));
    }

    update(data) {

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const activeTab = tabs[0];
          if (activeTab) {
            const url = activeTab.url;
            console.log('Current url:', url);
            if (url.startsWith('https://catpublications.com/') && url.includes('/Search')) {
              const cover = document.getElementById('cover');
              cover.classList.add('hidden');
            } else {
              console.log('Open catpub tab!');
            }
          } else {
            throw new Error('No avaliable active tabs were found');
          }
        });

        const startParsing = document.querySelector('[data-action="startParsing"]');
        const stopParsing = document.querySelector('[data-action="stopParsing"]');
        const restartParsing = document.querySelector('[data-action="restartParsing"]');
        const continueParsing = document.querySelector('[data-action="continueParsing"]');
        
        if (data.formData) {

          const pagesStat = document.querySelector('[data-stat="pages"]');
          const cardscount = document.querySelector('[data-stat="cardscount"]');
          const running = document.querySelector('[data-stat="running"]');
          const ended = document.querySelector('[data-stat="ended"]');
          const stopped = document.querySelector('[data-stat="stopReason"]');
          const stopReason = document.querySelector('[data-stat="stopReason"]');

          pagesStat.textContent = `${data.page + 1}/${data.totalPages}`;
          cardscount.textContent = data.cardsData?.length ?? '-';
          running.textContent = data.running;
          ended.textContent = data.ended;
          stopReason.textContent = data.stopReason;
          stopped.textContent = data.stopped;

          // startParsing.disabled = true;
          if (data.running) {
            startParsing.disabled = true;
            stopParsing.disabled = false;
            restartParsing.disabled = false;
            continueParsing.disabled = true;
          } else {
            startParsing.disabled = false;
            stopParsing.disabled = true;
            continueParsing.disabled = false;
            if (!data.ended) {
              continueParsing.disabled = false;
            } else {
              continueParsing.disabled = true;
            }
          }
        } else {
          stopParsing.disabled = true;
          restartParsing.disabled = true;
          continueParsing.disabled = true;
        }

        const downloadCardsData = document.querySelector('[data-action="downloadCardsData"]');
        if (data.cardsData) {
            downloadCardsData.disabled = false;
        } else {
            downloadCardsData.disabled = true;
        }
    }
}

const popup = new Popup();
popup.init();
console.log('Popup script successfuly initiated! Made by Doctor8296 :3', popup);
