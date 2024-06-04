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
    // Check if the current index starts with '**'
    if (text.substring(currentIndex, currentIndex + 2) === '**') {
      // Find the closing '**'
      let closingIndex = text.indexOf('**', currentIndex + 2);
      if (closingIndex !== -1) {
        // Extract the bold text
        let boldText = text.substring(currentIndex + 2, closingIndex);
        // Wrap the bold text in <strong> tags
        currentString += `<strong>${boldText}</strong>`;
        // Update the currentIndex to after the closing '**'
        currentIndex = closingIndex + 2;
      } else {
        // If no closing '**' is found, just add the '**'
        currentString += text[currentIndex];
        currentIndex++;
      }
    } else {
      currentString += text[currentIndex];
      currentIndex++;
    }

    element.innerHTML = currentString;
    if (currentIndex < text.length) {
      setTimeout(type, 10);
    }
  }

  type();
}

function generateUniqueId() {
  return `id-${Date.now()}-${Math.random().toString(16)}`;
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
      messageDiv.innerHTML = "Hello. How can I help you?"
      last_prompt = ""
      last_response = ""
      isLoading = false;
      return;
    }

    loader(messageDiv);

  const selectedOptions = {
    selectedOption1: document.querySelector(".first-dropdown").value,
    selectedOption2: document.querySelector(".second-dropdown").value,
    selectedOption3: document.querySelector(".third-dropdown").value,
    selectedOption4: document.querySelector(".fourth-dropdown").value
  };

  const message = JSON.stringify({
    type: 'prompt',
    data: {
      prompt: data.get('prompt'),
      selectedOption1: document.querySelector(".first-dropdown").value,
      selectedOption2: document.querySelector(".second-dropdown").value,
      selectedOption3: document.querySelector(".third-dropdown").value,
      selectedOption4: document.querySelector(".fourth-dropdown").value,
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


let isFirstMessage = true;

function handleMessage(msg) {
  const data = JSON.parse(msg.data);
  console.log('client response data: ', data);
  const { clean_text, cleanedText } = data;
  const messageDiv = document.getElementById(uniqueId);

  // Create and clear the waiting animation container
  if (isFirstMessage) {
    clearInterval(loadInterval);
    messageDiv.innerHTML = ''; // Clear the message div on the first message
    isFirstMessage = false;
  }

  if (data.type === 'result') {
    if (clean_text) {  // Process clean_text if provided
      const parsedDataContainer = document.createElement('div');
      parsedDataContainer.classList.add('parsed-data-container'); // Use a class instead of an id

      const parsedData = clean_text;

      typeText(parsedDataContainer, parsedData); // Type text after append
      messageDiv.appendChild(parsedDataContainer);

      last_response = parsedData;
    }

    if (cleanedText) {  // Process cleanedText if provided
      console.log('cleanedText', cleanedText);

      const sourceDocumentsContainer = document.createElement('div');
      sourceDocumentsContainer.classList.add('source-documents');

      // Create a list to hold the bullet points
      const bulletList = document.createElement('ul');
      // bulletList.classList.add('large-bullets');


      // Loop through the cleanedText array and add each item as a list item
      cleanedText.forEach(text => {
        const listItem = document.createElement('li');
        listItem.innerHTML = `&bull; ${text}`
            .trim()
            .replace(/\s+/g, ' ')  // Replace multiple spaces with a single space
            .replace(/[^\x20-\x7E]/g, '')  // Remove non-ASCII characters
            .replace(/\u00A0/g, ' ')  // Replace non-breaking spaces
            .replace(/\xc2\xa0/g, ' ')  // Handle escaped non-breaking spaces
            .replace(/\n+/g, ' ')  // Replace multiple newlines with a single space
            .replace(/\\n\\n/g, ' ')  // Replace escaped double newlines with a space
            .replace(/\\t/g, ' ')  // Replace escaped tabs with a single space
            .replace(/\\r\\n/g, ' ')  // Replace escaped carriage return + newline with a space
            .replace(/\\xe2\\x80\\x9c/g, '\"')  // Left double quotation mark
            .replace(/\\xe2\\x80\\x9d/g, '\"')  // Right double quotation mark
            .replace(/\\xe2\\x80\\x98/g, '\'')  // Left single quotation mark
            .replace(/\\xe2\\x80\\x99/g, '\'')  // Right single quotation mark
            .replace(/\\xe2\\x80\\x94/g, '—');  // Em dash

        bulletList.appendChild(listItem);
      });

      sourceDocumentsContainer.appendChild(bulletList);
      messageDiv.appendChild(sourceDocumentsContainer);

      const showSourcesButton = document.createElement('button');
      showSourcesButton.textContent = 'Read more...';
      showSourcesButton.classList.add('show-sources');
      messageDiv.appendChild(showSourcesButton);  // Append the button to messageDiv directly

      sourceDocumentsContainer.classList.add('hidden');
      isFirstMessage = true;
    }

    last_prompt = current_prompt;  // Ensure last_prompt is set correctly
  } else {
    messageDiv.innerHTML = "Something went wrong, please try again";
    isLoading = false;
    last_response = "";
    last_prompt = "";
    isFirstMessage = true;
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
  const reference = "Answered by LawyerBuddy.ai";

  const sharedText = `${text}\n\n${reference}`;
  const encodedSharedText = encodeURIComponent(sharedText);
  const baseURL = 'https://biblebuddy.ai'; // Replace with the desired URL

  const url = `https://www.facebook.com/dialog/feed?app_id=1212850366057820&link=${encodeURIComponent(baseURL)}&redirect_uri=${encodeURIComponent(baseURL)}`;
  window.open(url, '_blank');
}


// Add a delegated event listener to the document to handle "Read more..." button clicks
document.addEventListener('click', function(event) {
  if (event.target.matches('.show-sources')) {
    event.preventDefault();
    const showSourcesButton = event.target;
    const sourceDocumentsContainer = showSourcesButton.previousElementSibling;

    if (sourceDocumentsContainer) {
      sourceDocumentsContainer.classList.toggle('hidden');
      if (showSourcesButton.textContent === 'Read more...') {
        showSourcesButton.textContent = 'Read less...';
      } else {
        showSourcesButton.textContent = 'Read more...';
      }
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





let LawCodes = ["Business and Professionals Code","Civil Code","Code of Civil Procedure","Commercial Code", "Corporations Code", "Education Code", "Elections Code"
  , "Evidence Code", "Family Code", "Financial Code", "Fish and Game Code", "Food and Agriculture Code", "Government Code", "Harbors and Navigation Code", "Health and Safety Code"
  , "Insurance Code", "Labor Code", "Military and Vets Code", "Penal Code", "Probate Code", "Public Contract Code", "Public Resources Code", "Public Utilities Code", "Revenue and Taxation Code"
  , "Streets and Hwys Code", "Unemployment Insurance Code", "Vehicle Code", "Water Code", "Welfare and Institutions Code"];

let DenominationsFolderNames = ["Collections","Seventh Day Adventist"];
///////Create menu
const menuButton = document.getElementById('menu_button');

// If the menu container doesn't exist, create it
let menuContainer = document.createElement('div');
menuContainer.classList.add('menu-container');

const logoImg = document.createElement('img');
logoImg.src = './MainLogo.png';
logoImg.classList.add('logo-img'); // Add a class for styling

menuContainer.appendChild(logoImg);

// Add a line break between the image and text
menuContainer.appendChild(document.createElement('br'));

// Add some text to the menu container
const menuText = document.createElement('p');
menuText.textContent = 'Welcome to LawyerBuddy!';

// Add the text to the menu container
menuContainer.appendChild(menuText);

const instructionText = document.createElement('p');
instructionText.textContent = 'Ask LawyerBuddy some heated legal stuff only a Lawyer would know!';
instructionText.style.marginLeft = '15px'; // Adjust the value as needed

// Add the text to the menu container
menuContainer.appendChild(instructionText);

const BibleVersionText = document.createElement('p');
BibleVersionText.textContent = 'Select a Legal Specialty';

// Add the text to the menu container
menuContainer.appendChild(BibleVersionText);

// Create the first dropdown menu
const firstDropdown = document.createElement('select');
firstDropdown.classList.add('first-dropdown');
// console.log(BibleFolderNames);

// Loop through stored folder names and create options for the first dropdown menu
LawCodes.forEach(folderName => {
  const option = document.createElement('option');
  option.textContent = folderName;
  if (folderName != 'Collections') {
    if (folderName === 'Family Code') {
      option.selected = true;
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

const fourthDropdown = document.createElement('select');
fourthDropdown.classList.add('fourth-dropdown');
const singleAIOption = document.createElement('option');
singleAIOption.textContent = 'Single AI';
singleAIOption.selected = true;
fourthDropdown.appendChild(singleAIOption);

const teamAIOption = document.createElement('option');
teamAIOption.textContent = 'Team of AI';
fourthDropdown.appendChild(teamAIOption);
menuContainer.appendChild(fourthDropdown);

const announcementsSection = document.createElement('div');
announcementsSection.classList.add('announcements-section');
// Add a message to the announcements section
const announcementsMessage = document.createElement('p');
announcementsMessage.textContent = 'Announcements: ';
// Add the message to the announcements section
announcementsSection.appendChild(announcementsMessage);

const AnnouncementOne = document.createElement('p');
AnnouncementOne.textContent = 'We are excited to release our Beta version of LawyerBuddy to those who have been given this access. \n Please provide feedback in our Discord.\nEnjoy!';

// Add the text to the menu container
announcementsSection.appendChild(AnnouncementOne);



// Add the announcements section to the menu container
menuContainer.appendChild(announcementsSection);

// Create the Discord group link
const discordLink = document.createElement('a');
discordLink.classList.add('discord-link');
discordLink.href = 'https://discord.gg/G4FJcGZJDv';
discordLink.target = '_blank';
discordLink.textContent = 'Join our Discord group!';

// Add the Discord group link to the announcements section
announcementsSection.appendChild(discordLink);
menuContainer.appendChild(announcementsSection);

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
