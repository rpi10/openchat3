// File Upload Functionality
document.addEventListener('DOMContentLoaded', () => {
  const fileInput = document.getElementById('fileInput');
  const attachButton = document.getElementById('attachButton');

  if (attachButton) {
    attachButton.addEventListener('click', () => {
      fileInput.click();
    });
  }

  if (fileInput) {
    fileInput.addEventListener('change', async (e) => {
      if (!e.target.files.length || !currentConversation) return;
      
      const file = e.target.files[0];
      const formData = new FormData();
      formData.append('file', file);
      
      try {
        const response = await fetch('/upload', {
          method: 'POST',
          body: formData
        });
        
        if (!response.ok) throw new Error('Upload failed');
        
        const data = await response.json();
        
        // Send file message
        socket.emit('file message', {
          to: currentConversation,
          fileUrl: data.url,
          name: file.name,
          type: file.type,
          size: file.size
        });
        
        // Clear file input
        fileInput.value = '';
        
      } catch (error) {
        console.error('Error uploading file:', error);
        alert('Failed to upload file. Please try again.');
      }
    });
  }
}); 