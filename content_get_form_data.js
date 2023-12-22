console.log('catpubparser was injected /ᐠ. .ᐟ\\ (made by doctor8296)');

(function() {

  chrome.runtime.sendMessage(sendData(), function(response) {
    console.log('success:', response);
  });

  function sendData() {
    // const form = document.querySelector('form#searchForm');
    // if (!form) {
    //   return {
    //     command: 'contentScriptError',
    //     errorMessage: 'Form was not found on page'
    //   }
    // }

    // const formData = new FormData(form);
    // const searchFormData = {};
    // for (const [key, value] of formData.entries()) {
    //   searchFormData[key] = value;
    // }

    const formData = [
      ["__RequestVerificationToken", document.querySelector('input[name="__RequestVerificationToken"]')?.value],
      ["Category", document.querySelector('input[name="Category"]')?.value],
      ["SearchPubType", document.querySelector('[name="SearchPubType"]')?.value],
      ["SearchSort", document.querySelector('#SearchSort')?.value],
      ["PageNumber", document.querySelector('[name="PageNumber"]')?.value],
      ["FormNav", document.querySelector('[name="FromNav"]')?.value],
      ["SearchTerm", document.querySelector('[name="SearchTerm"]')?.value],
      ...[...document.querySelectorAll('[name="Languages"]')]
      .filter(checkbox=>checkbox.checked)
      .map(checkbox=>["Languages", checkbox.value]),
      ...[...document.querySelectorAll('input.filter-category')].filter(checkbox => checkbox.checked).reduce((arr, checkbox) => {
        return arr.concat(
          [
            [
              'Categories.Index', checkbox.closest('.checkbox')?.querySelector?.('[name="Categories.Index"]')?.value
            ],
            [
              checkbox.name, checkbox.value
            ],
            ...[...(checkbox?.closest?.('.search-category-container')?.querySelectorAll?.('.filter-productFamily-display input') || [])].filter(
              checkbox => checkbox.checked
            ).map(checkbox => [
              checkbox.name,
              checkbox.value
            ])
          ]);
      
      }, [])
    ];

    const pagesDescriptorElement = document.querySelector('div.row.text-white');

    if (!pagesDescriptorElement) {
      return {
        command: 'contentScriptError',
        errorMessage: 'Provided form does not contain any results'
      }
    }

    const [currentPage, totalPages, totalItems] = pagesDescriptorElement.textContent.match(/\d+/g).map(Number);

    return {
      command: 'dataFromContentScript',
      data: {
        formData,
        currentPage,
        totalPages,
        totalItems
      }
    }

  };

})();