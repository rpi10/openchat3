document.addEventListener('DOMContentLoaded', function() {
  // UI Elements
  const aiToolsButton = document.getElementById('ai-tools-button');
  const aiToolsModal = document.getElementById('ai-tools-modal');
  const aiToolsClose = document.getElementById('ai-tools-close');
  const aiToolTabs = document.querySelectorAll('.ai-tool-tab');
  const aiToolContents = document.querySelectorAll('.ai-tool-content');
  
  // AI Assistant Elements
  const aiChatMessages = document.getElementById('ai-chat-messages');
  const aiChatInput = document.getElementById('ai-chat-input');
  const aiChatSend = document.getElementById('ai-chat-send');
  
  // Argument Checker Elements
  const argumentInput = document.getElementById('argument-input');
  const argumentCheckBtn = document.getElementById('argument-check-btn');
  const argumentSourcesBtn = document.getElementById('argument-sources-btn');
  const argumentResult = document.getElementById('argument-result');
  const argumentSources = document.getElementById('argument-sources');
  
  // Text Correction Elements
  const correctionInput = document.getElementById('correction-input');
  const correctionBtn = document.getElementById('correction-btn');
  const correctionResult = document.getElementById('correction-result');
  
  // Image Generator Elements
  const imagePrompt = document.getElementById('image-prompt');
  const imageStyle = document.getElementById('image-style');
  const generateImageBtn = document.getElementById('generate-image-btn');
  const imageLoading = document.getElementById('image-loading');
  const imageContainer = document.getElementById('image-container');
  
  // Open AI Tools Modal
  aiToolsButton.addEventListener('click', function() {
    aiToolsModal.style.display = 'flex';
  });
  
  // Also add touchstart for better iPad compatibility
  aiToolsButton.addEventListener('touchstart', function(e) {
    e.preventDefault();
    aiToolsModal.style.display = 'flex';
  });
  
  // Close AI Tools Modal
  aiToolsClose.addEventListener('click', function() {
    aiToolsModal.style.display = 'none';
  });
  
  // Add touchstart for better iPad compatibility
  aiToolsClose.addEventListener('touchstart', function(e) {
    e.preventDefault();
    aiToolsModal.style.display = 'none';
  });
  
  // Also close when clicking outside the modal
  aiToolsModal.addEventListener('click', function(e) {
    if (e.target === aiToolsModal) {
      aiToolsModal.style.display = 'none';
    }
  });
  
  // Tab Switching
  aiToolTabs.forEach(tab => {
    tab.addEventListener('click', function() {
      // Remove active class from all tabs
      aiToolTabs.forEach(t => t.classList.remove('active'));
      // Add active class to clicked tab
      this.classList.add('active');
      
      // Hide all content sections
      aiToolContents.forEach(content => content.classList.remove('active'));
      
      // Show corresponding content section
      const tabName = this.getAttribute('data-tab');
      document.getElementById(`${tabName}-tab`).classList.add('active');
    });
    
    // Add touchstart for better iPad compatibility
    tab.addEventListener('touchstart', function(e) {
      e.preventDefault();
      // Remove active class from all tabs
      aiToolTabs.forEach(t => t.classList.remove('active'));
      // Add active class to touched tab
      this.classList.add('active');
      
      // Hide all content sections
      aiToolContents.forEach(content => content.classList.remove('active'));
      
      // Show corresponding content section
      const tabName = this.getAttribute('data-tab');
      document.getElementById(`${tabName}-tab`).classList.add('active');
    });
  });
  
  // AI Assistant Chat
  function appendAiMessage(message, sender) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('ai-message');
    messageDiv.classList.add(sender === 'user' ? 'ai-message-user' : 'ai-message-bot');
    messageDiv.textContent = message;
    aiChatMessages.appendChild(messageDiv);
    aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
  }
  
  async function sendAiChatMessage() {
    const message = aiChatInput.value.trim();
    if (!message) return;
    
    // Show user message
    appendAiMessage(message, 'user');
    aiChatInput.value = '';
    
    // Show loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'ai-loading';
    loadingDiv.innerHTML = '<div class="ai-loading-spinner"></div><div>Thinking...</div>';
    aiChatMessages.appendChild(loadingDiv);
    aiChatMessages.scrollTop = aiChatMessages.scrollHeight;
    
    try {
      // Send message to AI
      const response = await fetch('/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
      });
      
      // Remove loading indicator
      aiChatMessages.removeChild(loadingDiv);
      
      if (!response.ok) {
        throw new Error('Failed to get AI response');
      }
      
      const data = await response.json();
      appendAiMessage(data.reply, 'bot');
    } catch (error) {
      // Remove loading indicator if still present
      if (aiChatMessages.contains(loadingDiv)) {
        aiChatMessages.removeChild(loadingDiv);
      }
      appendAiMessage('Sorry, I encountered an error: ' + error.message, 'bot');
    }
  }
  
  aiChatSend.addEventListener('click', sendAiChatMessage);
  aiChatInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      sendAiChatMessage();
    }
  });
  
  // Argument Checker
  argumentCheckBtn.addEventListener('click', async function() {
    const argument = argumentInput.value.trim();
    if (!argument) return;
    
    // Show loading
    argumentResult.innerHTML = '<div class="ai-loading"><div class="ai-loading-spinner"></div><div>Analyzing argument...</div></div>';
    argumentResult.style.display = 'block';
    
    try {
      const response = await fetch('/checkargument', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ argument })
      });
      
      if (!response.ok) {
        throw new Error('Failed to check argument');
      }
      
      const data = await response.json();
      
      // Display the result with appropriate color
      argumentResult.innerHTML = `
        <div class="rating-${data.rating}">
          <strong>Rating: ${data.rating}/5</strong>
          <p>${data.explanation}</p>
        </div>
      `;
    } catch (error) {
      argumentResult.innerHTML = `<div style="color: red;">Error: ${error.message}</div>`;
    }
  });
  
  // Find Sources
  argumentSourcesBtn.addEventListener('click', async function() {
    const query = argumentInput.value.trim();
    if (!query) return;
    
    // Show loading
    argumentSources.innerHTML = '<div class="ai-loading"><div class="ai-loading-spinner"></div><div>Searching for sources...</div></div>';
    argumentSources.style.display = 'block';
    
    try {
      const response = await fetch('/searchsources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });
      
      if (!response.ok) {
        throw new Error('Failed to find sources');
      }
      
      const data = await response.json();
      
      if (!data.sources || data.sources.length === 0) {
        argumentSources.innerHTML = '<p>No sources found for this query.</p>';
        return;
      }
      
      // Display the sources
      let sourcesHtml = '<h3>Relevant Sources:</h3><ul>';
      data.sources.forEach(source => {
        sourcesHtml += `
          <li class="source-item">
            <a href="${source.url}" target="_blank">${source.title}</a>
          </li>
        `;
      });
      sourcesHtml += '</ul>';
      
      argumentSources.innerHTML = sourcesHtml;
    } catch (error) {
      argumentSources.innerHTML = `<div style="color: red;">Error: ${error.message}</div>`;
    }
  });
  
  // Text Correction
  correctionBtn.addEventListener('click', async function() {
    const text = correctionInput.value.trim();
    if (!text) return;
    
    // Show loading
    correctionResult.innerHTML = '<div class="ai-loading"><div class="ai-loading-spinner"></div><div>Correcting text...</div></div>';
    correctionResult.style.display = 'block';
    
    try {
      const response = await fetch('/correct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      
      if (!response.ok) {
        throw new Error('Failed to correct text');
      }
      
      const data = await response.json();
      
      // Display the corrected text
      correctionResult.innerHTML = `<p>${data.corrected}</p>`;
      
      // Create button container
      const buttonContainer = document.createElement('div');
      buttonContainer.style.display = 'flex';
      buttonContainer.style.gap = '10px';
      buttonContainer.style.marginTop = '10px';
      
      // Add a "Use this" button
      const useButton = document.createElement('button');
      useButton.textContent = 'Use this correction';
      useButton.className = 'correction-btn';
      useButton.addEventListener('click', function() {
        correctionInput.value = data.corrected;
        correctionResult.style.display = 'none';
      });
      
      // Add a "Send to chat" button
      const sendToChatButton = document.createElement('button');
      sendToChatButton.textContent = 'Send to chat';
      sendToChatButton.className = 'correction-btn';
      sendToChatButton.addEventListener('click', function() {
        // Set the corrected text to the chat input
        const chatInput = document.getElementById('input');
        if (chatInput) {
          chatInput.value = data.corrected;
          chatInput.focus();
        }
        
        // Close the AI tools modal
        const aiToolsModal = document.getElementById('ai-tools-modal');
        if (aiToolsModal) {
          aiToolsModal.style.display = 'none';
        }
      });
      
      // Add buttons to container
      buttonContainer.appendChild(useButton);
      buttonContainer.appendChild(sendToChatButton);
      
      // Add button container to result
      correctionResult.appendChild(buttonContainer);
    } catch (error) {
      correctionResult.innerHTML = `<div style="color: red;">Error: ${error.message}</div>`;
    }
  });
  
  // Image Generation
  generateImageBtn.addEventListener('click', handleImageGeneration);
  generateImageBtn.addEventListener('touchstart', function(e) {
    e.preventDefault();
    handleImageGeneration();
  });
  
  async function handleImageGeneration() {
    const prompt = imagePrompt.value.trim();
    if (!prompt) {
      alert('Please enter an image description');
      return;
    }
    
    // Show loading indicator
    imageLoading.style.display = 'block';
    imageContainer.innerHTML = '';
    
    try {
      // Make API call to our server endpoint
      const response = await fetch('/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt,
          style: imageStyle.value
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate image');
      }
      
      const data = await response.json();
      
      // Hide loading indicator
      imageLoading.style.display = 'none';
      
      // Display the generated image
      if (data.image) {
        const img = document.createElement('img');
        img.src = `data:image/png;base64,${data.image}`;
        img.alt = prompt;
        img.className = 'generated-image';
        img.loading = 'lazy';
        
        // Create image wrapper for better scroll handling
        const imageWrapper = document.createElement('div');
        imageWrapper.className = 'image-wrapper';
        imageWrapper.style.display = 'flex';
        imageWrapper.style.flexDirection = 'column';
        imageWrapper.style.alignItems = 'center';
        
        // Add click to expand functionality
        img.addEventListener('click', function() {
          showImageFullscreen(img.src);
        });
        
        // Add touchstart for iPad compatibility
        img.addEventListener('touchstart', function(e) {
          e.preventDefault();
          showImageFullscreen(img.src);
        });
        
        // Create action buttons - placed outside scroll container for better visibility
        const actionButtons = document.createElement('div');
        actionButtons.className = 'image-action-buttons';
        
        // Create download button
        const downloadBtn = document.createElement('button');
        downloadBtn.textContent = 'Download';
        downloadBtn.className = 'image-action-btn';
        downloadBtn.addEventListener('click', () => downloadGeneratedImage(data.image, prompt));
        downloadBtn.addEventListener('touchstart', (e) => {
          e.preventDefault();
          downloadGeneratedImage(data.image, prompt);
        });
        
        // Create "Send to chat" button
        const sendToChatBtn = document.createElement('button');
        sendToChatBtn.textContent = 'Send to Chat';
        sendToChatBtn.className = 'image-action-btn';
        sendToChatBtn.addEventListener('click', () => sendImageToChat(data.image, prompt));
        sendToChatBtn.addEventListener('touchstart', (e) => {
          e.preventDefault();
          sendImageToChat(data.image, prompt);
        });
        
        // Add buttons to container
        actionButtons.appendChild(downloadBtn);
        actionButtons.appendChild(sendToChatBtn);
        
        // Clear any previous images and content
        imageContainer.innerHTML = '';
        
        // First add the action buttons, then the image wrapper with the image
        // This ensures buttons are always visible at the top
        imageContainer.appendChild(actionButtons);
        imageWrapper.appendChild(img);
        imageContainer.appendChild(imageWrapper);
      } else {
        imageContainer.innerHTML = '<p>Failed to generate image. Please try again.</p>';
      }
    } catch (error) {
      imageLoading.style.display = 'none';
      imageContainer.innerHTML = `<p>Error: ${error.message}</p>`;
    }
  }
  
  // Function to download the generated image
  function downloadGeneratedImage(base64Image, prompt) {
    const link = document.createElement('a');
    link.href = `data:image/png;base64,${base64Image}`;
    link.download = `${prompt.substring(0, 20).replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
  
  // Function to send the generated image to chat
  function sendImageToChat(base64Image, prompt) {
    // Convert base64 to blob for file upload
    const byteString = atob(base64Image);
    const arrayBuffer = new ArrayBuffer(byteString.length);
    const int8Array = new Uint8Array(arrayBuffer);
    for (let i = 0; i < byteString.length; i++) {
      int8Array[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([int8Array], { type: 'image/png' });
    
    // Create file name
    const fileName = `${prompt.substring(0, 20).replace(/[^a-z0-9]/gi, '-')}-${Date.now()}.png`;
    
    // Create file object
    const file = new File([blob], fileName, { type: 'image/png' });
    
    // Use the existing file upload mechanism
    if (typeof uploadFile === 'function') {
      uploadFile(file);
      
      // Close the AI tools modal
      const aiToolsModal = document.getElementById('ai-tools-modal');
      if (aiToolsModal) {
        aiToolsModal.style.display = 'none';
      }
    } else {
      alert('Cannot send image to chat at this time');
    }
  }
  
  // Helper function to show fullscreen image
  function showImageFullscreen(src) {
    const modal = document.createElement('div');
    modal.style.position = 'fixed';
    modal.style.top = '0';
    modal.style.left = '0';
    modal.style.width = '100%';
    modal.style.height = '100%';
    modal.style.backgroundColor = 'rgba(0,0,0,0.8)';
    modal.style.display = 'flex';
    modal.style.justifyContent = 'center';
    modal.style.alignItems = 'center';
    modal.style.zIndex = '1000';
    
    const fullImg = document.createElement('img');
    fullImg.src = src;
    fullImg.style.maxWidth = '90%';
    fullImg.style.maxHeight = '90%';
    fullImg.style.objectFit = 'contain';
    
    modal.appendChild(fullImg);
    document.body.appendChild(modal);
    
    modal.addEventListener('click', function() {
      document.body.removeChild(modal);
    });
    
    // Also add touchstart for iPad
    modal.addEventListener('touchstart', function(e) {
      e.preventDefault();
      document.body.removeChild(modal);
    });
  }
  
  // Initialize with a welcome message in the AI assistant
  appendAiMessage('👋 Hello! I\'m your AI assistant. How can I help you today?', 'bot');
}); 