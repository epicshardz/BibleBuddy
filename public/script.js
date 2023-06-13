import config from '../config.js';

const botImageUrl = './bot.svg';
const userImageUrl = './user.svg';
const form = document.querySelector('form')
const chatContainer = document.querySelector('#chat_container')
const usageGuide = document.getElementById('usage-guide');
const refreshButton = document.getElementById('refresh-button');
const submitButton = document.querySelector('form button[type="submit"]');

let loadInterval;
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
function typeText(element, text) {
  let currentIndex = 0;
  let currentString = '';

  function type() {
    currentString += text[currentIndex];
    element.innerHTML = currentString;
    currentIndex++;
    if (currentIndex < text.length) {
      setTimeout(type, 20);
    }
  }

  type();
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

// This function creates separation between the text and code
function codeBlock (codeText) {
  return `
    <div class="code-block">
      <pre>
        ${codeText}
      </pre>
    </div>
  `;
}

function textBlock (text) {
  return `
    <div class="text-block">
      ${text}
    </div>
  `;
}


function prepareTextBlocks(content) {
  const codeBlockRegex = /```([\s\S]*?)```/g;
  const textBlocks = content.split(codeBlockRegex);

  let formattedBlocks = "";
  for (let i = 0; i < textBlocks.length; i++) {
    const block = textBlocks[i].trim();
    if (i % 3 === 1) {
      formattedBlocks += codeBlock(block);
    } else if (block.length > 0) {
      formattedBlocks += textBlock(block);
    }
  }
  return formattedBlocks;
}


let chat_history = [];
let last_response = "";
let last_prompt = ""
let current_prompt = ""
let socket;

// Connect to WebSocket server
function connectWebSocket() {
  let socketUrl;
  if (window.location.protocol === 'https:') {
    socketUrl = 'wss://' + window.location.host;
  } else {
    socketUrl = 'ws://' + window.location.host;
  }
  
  socket = new WebSocket(socketUrl);
  
  socket.addEventListener('open', () => {
    console.log('WebSocket connection established');


  });
  
  socket.addEventListener('close', () => {
    console.log('WebSocket connection closed');
  });
  
  socket.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    if (data.type === 'result') {
      const { clean_text, cleanedText } = data;
      // Do something with the response data
      console.log('Clean text:', clean_text);
      console.log('Source documents:', cleanedText);
      handleMessage(event)
      isLoading = false; // add this line to set isLoading to true
    } else if (data.type === 'stay_alive') {
      console.log('Received stay alive signal from server');
      // Handle stay alive signal
    }
    
  });
  
  socket.addEventListener('error', (error) => {
    console.error('WebSocket error', error);
  });

  return socket;
}

function sendMessageToWebSocket(message) {
  console.log('WebSocket message sent:', message);
  if (!socket || socket.readyState !== WebSocket.OPEN) {
    // Connect to WebSocket server
    connectWebSocket();

    // Wait for the connection to be established
    socket.addEventListener('open', () => {
      // Send the message
      socket.send(message);
    });
  } else {
    // Connection is already established, send the message
    socket.send(message);
  }
}
let isLoading = false

let uniqueId;
function handleSubmit(e) {
  try {
    e.preventDefault();
    if (usageGuide) {
      usageGuide.style.display = 'none';
      refreshButtonHandler.show();
    }

    const data = new FormData(form);

    //user's chatStripe
    current_prompt = data.get('prompt').replace(/\\n\\n/g, '')
    chatContainer.innerHTML += chatStrip(false, data.get('prompt'));

    form.reset()
    isLoading = true; // add this line to set isLoading to true
    
    // bot's chatstripe
    uniqueId = generateUniqueId();
    chatContainer.innerHTML += chatStrip(true, " ", uniqueId);

    chatContainer.scrollTop = chatContainer.scrollHeight;

    const messageDiv = document.getElementById(uniqueId);
    if (data.get('prompt').length < 5){
      messageDiv.innerHTML = "I'm sorry, I don't understand what you're asking. Can you please provide a specific question?"
      last_prompt = ""
      last_response = ""
      isLoading = false;
      return;
    }

    loader(messageDiv);

    // Get form data
    const option1 = document.querySelector(".first-dropdown");
    const selectedOption1 = option1.options[option1.selectedIndex].text;
    const option2 = document.querySelector(".second-dropdown");
    const selectedOption2 = option2.options[option2.selectedIndex].text;
    const option3 = document.querySelector(".third-dropdown");
    const selectedOption3 = option3.options[option3.selectedIndex].text;

    // Send message to WebSocket server
    const message = JSON.stringify({
      type: 'prompt',
      data: {
        prompt: data.get('prompt'),
        selectedOption1: selectedOption1,
        selectedOption2: selectedOption2,
        selectedOption3: selectedOption3,
        last_response: last_response,
        last_prompt: last_prompt,
      },
    });
    sendMessageToWebSocket(message);

    
  } catch (error) {
    console.error(error);
    messageDiv.innerHTML = "Something went wrong, please try again"
    console.log(error.message);
    isLoading = false; // add this line to set isLoading to true
    last_response = "";    
    last_prompt = ""
  }
}

function handleMessage(msg) {

  clearInterval(loadInterval)
  
  const data = JSON.parse(msg.data);
  // data = msg
  console.log('client response data: ',data)
  const { clean_text, cleanedText } = data;
  const messageDiv = document.getElementById(uniqueId);
  messageDiv.innerHTML = '';

  if (data.type === 'result') {
    const blockRegex = /```([\s\S]*?)```/g;

    // const parsedData = clean_text.replace(blockRegex, '<div class="code-block"><pre>$1</pre><button class="copy-button">Copy Text</button></div>');

    const parsedData = clean_text + '<div class="button-container"><button class="copy-button" onclick="copyCode(event, this)">Copy Text</button><button class="share-button" onclick="shareToFacebook(event, this)">Share on Facebook</button></div>';


    console.log('cleanedText', cleanedText)
    const sourceData = cleanedText.toString()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\\s+/g, ' ')
    .replace(/[^\x20-\x7E]/gmi, '')
    .replace(/\u00A0/g, '')
    .replace(/\n+/g, '\n')
    .replace(/\n/g, '<br />')
    .replace(/\\n\\n/g, '<br />')
    .replace(/\\t/g, ' ')
    .replace(/,(?=<a href)/g, ',<br /><a href')
    .replace(/b'|b"/g, '<br />• ')
    .replace(/\\r\\n/g, ' ')
    .replace(/\\xe2\\x80\\x9c/g, '\"') // Left double quotation mark
    .replace(/\\xe2\\x80\\x9d/g, '\"') // Right double quotation mark
    .replace(/\\xe2\\x80\\x98/g, '\'') // Left single quotation mark
    .replace(/\\xe2\\x80\\x99/g, '\'') // Right single quotation mark
    .replace(/\\xe2\\x80\\x94/g, '—')
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036\u00AB\u00BB\u300C\u300D\u301D\u301E\u301F\uFF02]/g, '\"');



  


    

    const parsedDataContainer = document.createElement('div');

    typeText(parsedDataContainer, parsedData)
    // last_response = parsedData;

    // Add the parsed data container to the message div
    messageDiv.appendChild(parsedDataContainer);

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

    // Update last_response
    last_response = parsedData;    
    last_prompt = current_prompt
  } else {

        messageDiv.innerHTML = "Something went wrong, please try again"
        isLoading = false; // add this line to set isLoading to true
        last_response = "";    
        last_prompt = ""
        // console.log(err)
  }

}

function copyCode(event, buttonElement) {
  event.preventDefault();
  const codeBlock = buttonElement.parentElement.parentElement;
  const range = document.createRange();
  range.selectNode(codeBlock);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  document.execCommand('copy');
  window.getSelection().removeAllRanges();
  
  const notification = document.createElement('div');
  notification.classList.add('notification');
  notification.textContent = 'Text copied to clipboard!';
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 1000);
  }, 1000);
}

function shareToFacebook(event, buttonElement) {
  event.preventDefault();
  const divElement = buttonElement.parentElement.parentElement;
  const text = divElement.textContent.trim();
  const reference = "Answered by BibleBuddy.ai";

  const sharedText = `${text}\n\n${reference}`;
  const encodedSharedText = encodeURIComponent(sharedText);
  const baseURL = 'https://biblebuddy.ai'; // Replace with the desired URL
  const imageURL = 'public/biblebuddylogo.png'; // Replace with the URL of your desired image
  const encodedImageURL = encodeURIComponent(imageURL);
  
  const url = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(baseURL)}&quote=${encodedSharedText}&picture=${encodedImageURL}&hashtag=%23BibleBuddy`;
  window.open(url, '_blank');
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
  if (event.target.matches('.copy-button')) {
    event.preventDefault();
    const copyButton = event.target;
    copyCode(event, copyButton);
  }
  if (event.target.matches('.share-button')) {
    event.preventDefault();
    const shareButton = event.target;
    shareToFacebook(event, shareButton);
  }
});


let BibleFolderNames = ["ASV","Collections","KJV","AKJV", "ACV", "NETBible"];

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
instructionText.textContent = 'Ask BibleBuddy any Bible-related question and receive an accurate answer in seconds!';

// Add the text to the menu container
menuContainer.appendChild(instructionText);

const BibleVersionText = document.createElement('p');
BibleVersionText.textContent = 'Select a Bible Version';

// Add the text to the menu container
menuContainer.appendChild(BibleVersionText);

// Create the first dropdown menu
const firstDropdown = document.createElement('select');
firstDropdown.classList.add('first-dropdown');
// console.log(BibleFolderNames);

// Loop through stored folder names and create options for the first dropdown menu
BibleFolderNames.forEach(folderName => {
  const option = document.createElement('option');
  option.textContent = folderName;
  if (folderName != 'Collections') {
    if (folderName === 'KJV') {
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

const thirdDropdown = document.createElement('select');
thirdDropdown.classList.add('third-dropdown');

const fastOption = document.createElement('option');
fastOption.textContent = 'Fast Answers - GPT-3';
fastOption.selected = true;
thirdDropdown.appendChild(fastOption);

const slowOption = document.createElement('option');
slowOption.textContent = 'Slow and quality Answers - GPT-4';
thirdDropdown.appendChild(slowOption);

menuContainer.appendChild(thirdDropdown);


// Create the announcements section
const announcementsSection = document.createElement('div');
announcementsSection.classList.add('announcements-section');
// Add a message to the announcements section
const announcementsMessage = document.createElement('p');
announcementsMessage.textContent = 'Announcements:';

// Add the message to the announcements section
announcementsSection.appendChild(announcementsMessage);

// Add the announcements section to the menu container
menuContainer.appendChild(announcementsSection);

// Create the Discord group link
const discordLink = document.createElement('a');
discordLink.classList.add('discord-link');
discordLink.href = 'https://discord.gg/BYGtb7swfe';
discordLink.target = '_blank';
discordLink.textContent = 'Join our Discord group!';

// Add the Discord group link to the announcements section
announcementsSection.appendChild(discordLink);

if (window.innerWidth > 1267) {
  menuButton.style.display = 'none';
  menuContainer.style.top = '0';
  menuContainer.style.left = '0';
  menuContainer.style.height = '100vh';

  // Create the main container and set it to display flex
  // Append the menu container to the existing div with the id "app"
  const appContainer = document.getElementById('main-layout-and-sidebar');
  appContainer.insertBefore(menuContainer, appContainer.firstChild);
} else {
  // Append the menu container to the page
  document.body.appendChild(menuContainer);
  // Hide the menu container initially
  menuContainer.style.display = 'none';
  // Position the menu container below the menu button
  const menuButtonRect = menuButton.getBoundingClientRect();
  menuContainer.style.top = `${menuButtonRect.bottom}px`;
  menuContainer.style.left = `${menuButtonRect.left}px`;
  menuContainer.style.position = 'absolute';
  const ChatContainer = document.getElementById('chat_container');
  ChatContainer.style.paddingLeft = '0px';
  ChatContainer.style.width = '100%';



  // Add a click event listener to the menu button
  menuButton.addEventListener('click', (e) => {
  // Prevent the default behavior of the button
  e.preventDefault();

  // Stop the click event from bubbling up to the document level
  e.stopPropagation();

  menuContainer.style.display = (menuContainer.style.display === 'none') ? 'block' : 'none';
  if (usageGuide) {
    usageGuide.style.display = 'none';
  }
  });

  document.addEventListener('click', (e) => {
    if (menuContainer.style.display === 'block' && !menuContainer.contains(e.target)) {
      menuContainer.style.display = 'none';
    }
  });
}


//////////
const dismissButton = document.getElementById('dismiss-usage-guide');
dismissButton.addEventListener('click', () => {
  usageGuide.style.display = 'none';
});
// listens for submit
form.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!isLoading) {
    handleSubmit(e);
  }
});

form.addEventListener('keyup', (e) =>{
  // If Enter key is pressed without the Shift key, submit the form
  if (e.keyCode === 13 && !e.shiftKey) {
    if (!isLoading) {
      handleSubmit(e);
    }
  }

  // If Shift + Enter key combination is pressed, create a new line
  if (e.shiftKey && e.keyCode === 13) {
    e.preventDefault();
    var textarea = e.target;
    textarea.value += '\n';
  }
})

class RefreshButton {
  constructor(button) {
    this.button = button;
    this.addEventListeners();
  }
  
  addEventListeners() {
    this.button.addEventListener('click', () => {
      location.reload();
    });
  }
  
  show() {
    this.button.style.display = 'block';
  }
}

const refreshButtonHandler = new RefreshButton(refreshButton);

document.addEventListener('DOMContentLoaded', () => {
  connectWebSocket();
});
