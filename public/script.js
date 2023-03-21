import config from '../config.js';

const botImageUrl = './bot.svg';
const userImageUrl = './user.svg';
const form = document.querySelector('form')
const chatContainer = document.querySelector('#chat_container')

let loadInterval;
console.log('script running')
// This function shows the ... while the Ai is loading/processing
function loader(element){
  element.textContent = '';

  loadInterval = setInterval(() => {
    element.textContent += '.';
    if (element.textContent === "....") {
      element.textContent = '';
    }
  }, 300)
}

// This function slowly types the output from the Ai
function typeText(element, text){
  let index = 0;

  let interval = setInterval(() => {
    if(index < text.length) {
      element.innerHTML += text.charAt(index);
      index++;

    } else {
      clearInterval(interval);
    }
  }, 20)
}

// This function is for generating a unique user ID
function generateUniqueId() {
  const timestamp = Date.now();
  const randomNumber = Math.random();
  const hexadecimalString = randomNumber.toString(16);

  return `id-${timestamp}-${hexadecimalString}`;
}

// This function creates separation between the chat messages
function chatStrip (isAi, value, uniqueId) {
  return (
    `
    <div class="wrapper ${isAi && 'ai'}">
      <div class="chat">
        <div class="profile">
          <img
            src="${isAi ? botImageUrl : userImageUrl}"
            alt="${isAi ? 'bot' : 'user'}"
          />
        </div>
        <div class="message" id=${uniqueId}>${value.trim()}</div>
      </div>
    </div>
    `
  )
}
let chat_history = [];
let last_response = "";
let last_prompt = ""
const handleSubmit = async (e) => {
  e.preventDefault();

  const data = new FormData(form);

  //user's chatStripe
  last_prompt = data.get('prompt').replace(/\\n\\n/g, '')
  chatContainer.innerHTML += chatStrip(false, data.get('prompt'));

  form.reset()

  // bot's chatstripe
  const uniqueId = generateUniqueId();
  chatContainer.innerHTML += chatStrip(true, " ", uniqueId);

  chatContainer.scrollTop = chatContainer.scrollHeight;

  const messageDiv = document.getElementById(uniqueId);

  loader(messageDiv);

  // fetch data from server
  const option1 = document.querySelector(".first-dropdown");
  const selectedOption1 = option1.options[option1.selectedIndex].text;
  const option2 = document.querySelector(".second-dropdown");
  const selectedOption2 = option2.options[option2.selectedIndex].text;

const response = await fetch(config.serverUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  credentials: 'include', // Add this line
  body: JSON.stringify({
    prompt: data.get('prompt'),
    selectedOption1: selectedOption1,
    selectedOption2: selectedOption2,
    last_response: last_response,
    last_prompt: last_prompt,
  })
})

  

  clearInterval(loadInterval)
  messageDiv.innerHTML = '';

  if(response.ok){
    const data = await response.json();
    const parsedData = data.bot
      .trim()
      .replace(/\n/g, '')
      .replace(/\\n\\n/g, '');

    const sourceData = data.source_documents
    .join(", ")
    .trim()
    .replace(/\n/g, '<br />')
    .replace(/\\n\\n/g, '<br />')
    .replace(/\\t/g, ' ');


    const parsedDataContainer = document.createElement('div');
    typeText(parsedDataContainer, parsedData)
    last_response = parsedData;
    
    // Add the parsed data container to the message div
    messageDiv.appendChild(parsedDataContainer);

    const space = document.createTextNode(' ');

    // Create the "Read more" button and add it after the parsed data container
    const showSourcesButton = document.createElement('button');
    showSourcesButton.textContent = 'Read more...';
    showSourcesButton.classList.add('show-sources');
    parsedDataContainer.after(showSourcesButton);

    // Add the source documents container
    const sourceDocumentsContainer = document.createElement('div');
    sourceDocumentsContainer.innerHTML = sourceData;
    sourceDocumentsContainer.classList.add('source-documents');
    sourceDocumentsContainer.id = `source-documents-${uniqueId}`;
    messageDiv.appendChild(sourceDocumentsContainer);

    // Hide the source documents container initially
    sourceDocumentsContainer.classList.add('hidden');

  } else {
    const err = await response.text();

    messageDiv.innerHTML = "Something went wrong"

    alert(err)
  }
}

// Add a delegated event listener to the document to handle "Read more..." button clicks
document.addEventListener('click', function(event) {
  if (event.target.matches('.show-sources')) {
    event.preventDefault();
    const showSourcesButton = event.target;
    const parsedDataContainer = showSourcesButton.previousElementSibling;
    const sourceDocumentsContainer = showSourcesButton.nextElementSibling;
    parsedDataContainer.classList.toggle('hide');
    sourceDocumentsContainer.classList.toggle('hidden');
    if (showSourcesButton.textContent === 'Read more...') {
      showSourcesButton.textContent = 'Read less...';
    } else {
      showSourcesButton.textContent = 'Read more...';
    }
  }
});


let BibleFolderNames = ["ASV","Collections","KJV","NKJV"];

let DenominationsFolderNames = ["Collections","Seventh Day Adventist"];
///////Create menu
const menuButton = document.getElementById('menu_button');

// If the menu container doesn't exist, create it
let menuContainer = document.createElement('div');
menuContainer.classList.add('menu-container');
// Add some text to the menu container
const menuText = document.createElement('p');
menuText.textContent = 'Welcome to BibleBuddy!';

// Add the text to the menu container
menuContainer.appendChild(menuText);

const instructionText = document.createElement('p');
instructionText.textContent = 'Ask any question and get an answer from our AI but only if its in the Bible';

// Add the text to the menu container
menuContainer.appendChild(instructionText);

// Create the first dropdown menu
const firstDropdown = document.createElement('select');
firstDropdown.classList.add('first-dropdown');
// console.log(BibleFolderNames);

// Loop through stored folder names and create options for the first dropdown menu
BibleFolderNames.forEach(folderName => {
  const option = document.createElement('option');
  option.textContent = folderName;
  if (folderName != 'Collections') {
    if (folderName === 'NKJV') {
      option.selected = true; // set selected to true for the KJV option
    }
    firstDropdown.appendChild(option);
  };
});

// Add the first dropdown to the menu container
menuContainer.appendChild(firstDropdown);

// Create the second dropdown menu
const secondDropdown = document.createElement('select');
secondDropdown.classList.add('second-dropdown');

// Loop through stored folder names and create options for the second dropdown menu
DenominationsFolderNames.forEach(folderName => {
  const option = document.createElement('option');
  option.textContent = folderName;
  if (folderName != 'Collections') {
    if (folderName === 'Non-Denominational') {
      option.selected = true; // set selected to true for the KJV option
    }
    secondDropdown.appendChild(option);
  };
});

// Add the second dropdown to the menu container
menuContainer.appendChild(secondDropdown);

// Append the menu container to the page
document.body.appendChild(menuContainer);
// Hide the menu container initially
menuContainer.style.display = 'none';
// Position the menu container below the menu button
const menuButtonRect = menuButton.getBoundingClientRect();
menuContainer.style.top = `${menuButtonRect.bottom}px`;
menuContainer.style.left = `${menuButtonRect.left}px`;


// Add a click event listener to the menu button
menuButton.addEventListener('click', (e) => {
// Prevent the default behavior of the button
e.preventDefault();

// Stop the click event from bubbling up to the document level
e.stopPropagation();

menuContainer.style.display = (menuContainer.style.display === 'none') ? 'block' : 'none';
});

document.addEventListener('click', (e) => {
  if (menuContainer.style.display === 'block' && !menuContainer.contains(e.target)) {
    menuContainer.style.display = 'none';
  }
});
//////////

// listens for submit
form.addEventListener('submit', handleSubmit);
form.addEventListener('keyup', (e) =>{
  if (e.keyCode === 13) {
    handleSubmit(e);
  }
})
