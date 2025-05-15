// File Message Handling
function displayFileMessage(data) {
  const messagesContainer = document.getElementById('messages');
  
  // Add day header if needed
  if (lastDisplayedDay !== data.dayLabel) {
    const header = document.createElement('li');
    header.className = 'day-header';
    header.textContent = data.dayLabel;
    header.style.listStyleType = 'none';
    messagesContainer.appendChild(header);
    lastDisplayedDay = data.dayLabel;
  }
  
  const bubble = document.createElement('li');
  bubble.className = data.from === currentUser ? 'message-from-me' : 'message-from-others';
  bubble.style.listStyleType = 'none';
  
  // Include sender name for messages not from current user
  const senderName = data.from !== currentUser ? `<div class="message-sender">${data.from}</div>` : '';
  
  // Convert file size for display
  const formattedSize = formatFileSize(data.size || 0);
  
  // Handle different file types
  let fileContent = '';
  
  if (data.type && data.type.startsWith('image/')) {
    fileContent = `
      <div class="file-message" data-type="image">
        <img src="${data.fileUrl}" alt="${data.name || 'Image'}" style="max-width: 200px; cursor: pointer;">
      </div>
    `;
  } else if (data.type && data.type.startsWith('audio/')) {
    fileContent = `
      <div class="file-message" data-type="audio">
        <audio controls>
          <source src="${data.fileUrl}" type="${data.type}">
          Your browser doesn't support audio playback.
        </audio>
      </div>
    `;
  } else if (data.type && data.type.startsWith('video/')) {
    fileContent = `
      <div class="file-message" data-type="video">
        <video controls style="max-width: 200px;">
          <source src="${data.fileUrl}" type="${data.type}">
          Your browser doesn't support video playback.
        </video>
      </div>
    `;
  } else {
    // Generic file download
    fileContent = `
      <div class="file-message" data-type="file">
        <a href="${data.fileUrl}" download="${data.name}" class="file-download">
          <div class="file-icon">📄</div>
          <div class="file-info">
            <div class="file-name">${data.name || 'File'}</div>
            <div class="file-size">${formattedSize}</div>
          </div>
        </a>
      </div>
    `;
  }
  
  bubble.innerHTML = senderName + fileContent + `<span class="message-time">${data.timestamp}</span>`;
  
  // Add click events for image preview
  if (data.type && data.type.startsWith('image/')) {
    const img = bubble.querySelector('img');
    if (img) {
      img.addEventListener('click', function() {
        const modal = document.getElementById('image-preview-modal');
        if (modal) {
          const previewImg = document.getElementById('preview-image');
          previewImg.src = data.fileUrl;
          modal.style.display = 'flex';
        }
      });
    }
  }
  
  messagesContainer.appendChild(bubble);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Helper function to format file size
function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Socket event handler for file messages
socket.on('file message', (data) => {
  // Immediately display the file message without waiting for user click
  displayFileMessage(data);
  
  // If it's a message from someone else, show notification
  if (data.from !== currentUser) {
    playBeep();
    showNotification(data.from, 'Sent you a file');
    
    // Update unread counter
    unseenMessages[data.from] = (unseenMessages[data.from] || 0) + 1;
    const userItem = Array.from(usersList.children).find(li => li.textContent.trim().startsWith(data.from));
    if (userItem) {
      let count = userItem.querySelector('.unseen-count');
      if (!count) {
        count = document.createElement('span');
        count.className = 'unseen-count';
        userItem.appendChild(count);
      }
      count.textContent = unseenMessages[data.from];
    }
  }
}); 