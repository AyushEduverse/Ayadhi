document.addEventListener('DOMContentLoaded', () => {
    const conversationsView = document.getElementById('conversations-view');
    const messagesList = document.getElementById('messages-list');
    const chatWindow = document.getElementById('chat-window');
    const backIcon = chatWindow.querySelector('.back-icon');
    const chatPartnerName = document.getElementById('chat-partner-name');
    const chatPartnerAvatar = chatWindow.querySelector('.chat-partner-avatar');
    const activeChatMessages = document.getElementById('active-chat-messages');
    const messageInput = document.getElementById('message-input');
    const sendButton = document.getElementById('send-button');
    const logoutButton = document.getElementById('logout-button');
    const profileButton = document.getElementById('profile-button'); // Added profile button
    const myHeaderAvatar = document.getElementById('my-header-avatar'); // New: My avatar in the header
    const profileSection = document.getElementById('profile-section'); // New: Profile section container
    const profileBackButton = document.getElementById('profile-back-button'); // New: Back button on profile page
    const profileUserName = document.getElementById('profile-user-name'); // New: Profile display name
    const profileUserEmail = document.getElementById('profile-user-email'); // New: Profile display email
    const profileUserAvatar = document.getElementById('profile-user-avatar'); // New: Profile display avatar
    const profileUserBioDisplay = document.getElementById('profile-user-bio-display'); // New: Element to display user bio
    const profileUserPhone = document.getElementById('profile-user-phone'); // New: Profile display phone number
    // Removed: const typingIndicator = document.getElementById('typing-indicator'); // New: Typing indicator element
    
    const chatPartnerOnlineStatus = chatWindow.querySelector('.chat-partner-info .online-status');
    const chatPartnerStatusText = document.getElementById('chat-partner-status-text'); // New: Chat partner status text
    const refreshButton = document.getElementById('refresh-button'); // Updated to use getElementById

    // Moved inside DOMContentLoaded for correct initialization
    const profileNameInput = document.getElementById('profile-name-input');
    const profileBioInput = document.getElementById('profile-bio-input');
    const updateProfileButton = document.getElementById('update-profile-button');

    // Removed emojiButton and attachFileButton selectors
    // Removed micButton selector

    // Firebase references
    const db = firebase.firestore();
    const auth = firebase.auth();

    let activeConversation = null;
    let unsubscribeMessages = null;
    let unsubscribeTypingStatus = null; // New: To unsubscribe from typing status listener
    let unsubscribePartnerStatus = null; // New: To unsubscribe from partner online status listener
    let clearTypingStatusTimeout = null; // New: To manage typing status timeout

    let currentUserId = null;
    let currentUserName = 'Guest';

    // New: Object to store unsubscribe functions for real-time user status listeners in the conversation list
    let unsubscribeUserStatuses = {};

    // Cloudinary configuration (REPLACE WITH YOUR ACTUAL CLOUD NAME AND UPLOAD PRESET)
    const cloudinaryCloudName = 'dfqq11sxk'; // Replace with your Cloudinary Cloud Name
    const cloudinaryUploadPreset = 'profile_picture_uploads'; // Replace with the unsigned upload preset you created

    // Initialize Cloudinary Widget
    const clUploadWidget = cloudinary.createUploadWidget(
        { 
            cloudName: cloudinaryCloudName, 
            uploadPreset: cloudinaryUploadPreset,
            sources: ['local', 'url', 'camera'] // Allow upload from local files, URLs, and camera
        },
        (error, result) => {
            if (!error && result && result.event === "success") {
                console.log('Done uploading Cloudinary image!', result.info);
                const newImageUrl = result.info.secure_url;
                
                // Update profile avatar on the page
                profileUserAvatar.src = newImageUrl;

                // Update user's profile in Firestore
                if (currentUserId) {
                    db.collection('users').doc(currentUserId).update({
                        avatar: newImageUrl
                    }).then(() => {
                        console.log("User avatar updated in Firestore!");
                        // Update the header avatar as well
                        if (myHeaderAvatar) {
                            myHeaderAvatar.src = newImageUrl;
                        }
                        // Optionally, update the conversation list avatar as well if it's visible
                        // You might need to re-render the conversations or update the specific avatar element
                        fetchAndRenderUsersAsConversations(); // Re-fetch and render conversations to update avatars
                    }).catch((error) => {
                        console.error("Error updating user avatar in Firestore: ", error);
                    });
                }
            }
        }
    );

    // Open Cloudinary widget on profile avatar click
    if (profileUserAvatar) {
        profileUserAvatar.style.cursor = 'pointer'; // Indicate it's clickable
        profileUserAvatar.addEventListener('click', () => {
            clUploadWidget.open();
        });
    }

    // Main initialization logic, waiting for authentication state
    auth.onAuthStateChanged(async (user) => {
        if (user) {
            currentUserId = user.uid;
            console.log("Auth State Changed: User logged in. UID:", currentUserId);

            // Set user status to online and update lastOnline timestamp when logged in
            await db.collection('users').doc(currentUserId).set({
                lastOnline: firebase.firestore.FieldValue.serverTimestamp() // Set lastOnline timestamp
            }, { merge: true });

            // Start periodic online status updates
            startOnlineStatusMonitoring();

            try {
                const doc = await db.collection('users').doc(user.uid).get();
                if (doc.exists) {
                    currentUserName = doc.data().name || user.email.split('@')[0];
                    // Update header avatar
                    if (myHeaderAvatar) {
                        myHeaderAvatar.src = doc.data().avatar || 'https://randomuser.me/api/portraits/men/1.jpg';
                    }
                    console.log("User data fetched. Current user name:", currentUserName);
                } else {
                    currentUserName = user.email.split('@')[0];
                    console.warn("User document not found in Firestore for UID:", user.uid, ". Defaulting name.");
                    // Optionally, create a user document if it doesn't exist for a logged-in user (e.g., from a different sign-in method)
                    await db.collection('users').doc(user.uid).set({
                        name: currentUserName,
                        email: user.email,
                        avatar: '',
                        createdAt: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });

                    // Update header avatar with default if new user
                    if (myHeaderAvatar) {
                        myHeaderAvatar.src = 'https://randomuser.me/api/portraits/men/1.jpg';
                    }
                }
                await fetchAndRenderUsersAsConversations(); // Render conversations ONLY after current user is known
            } catch (error) {
                console.error("Error fetching current user data or rendering conversations:", error);
                currentUserName = user.email.split('@')[0];
                // Fallback for header avatar if error
                if (myHeaderAvatar) {
                    myHeaderAvatar.src = 'https://randomuser.me/api/portraits/men/1.jpg';
                }
                await fetchAndRenderUsersAsConversations();
            }
        } else {
            console.log("Auth State Changed: No user logged in. Redirecting to login.html...");
            // This redirect is handled by index.html, but logging confirms the state.
        }
    });

    // Handle user going offline when tab/browser is closed
    window.addEventListener('beforeunload', async () => {
        if (currentUserId) {
            // Only update lastOnline timestamp; rely on client-side inference for offline status
            await db.collection('users').doc(currentUserId).update({
                lastOnline: firebase.firestore.FieldValue.serverTimestamp() // Update timestamp for graceful exit
            });
            // We are no longer explicitly setting onlineStatus to 'offline' here
            console.log("User lastOnline timestamp updated on beforeunload.");
        }
    });

    // Function to continuously update user's online status
    let onlineStatusInterval = null;
    function startOnlineStatusMonitoring() {
        if (onlineStatusInterval) {
            clearInterval(onlineStatusInterval);
        }
        // Update lastOnline timestamp every 10 seconds to indicate activity
        onlineStatusInterval = setInterval(async () => {
            if (currentUserId) {
                try {
                    await db.collection('users').doc(currentUserId).update({
                        lastOnline: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    // console.log("Last online timestamp updated."); // Log less frequently
                } catch (error) {
                    console.error("Error updating last online timestamp:", error);
                }
            }
        }, 10000); // Update every 10 seconds
    }

    // Function to fetch users from Firestore and render them as conversations
    async function fetchAndRenderUsersAsConversations() {
        if (!currentUserId) {
            console.warn("fetchAndRenderUsersAsConversations: currentUserId is null. Cannot fetch users.");
            return; // Ensure currentUserId is set
        }

        // Clear existing user status listeners before re-rendering
        for (const userId in unsubscribeUserStatuses) {
            if (unsubscribeUserStatuses[userId]) {
                unsubscribeUserStatuses[userId]();
                delete unsubscribeUserStatuses[userId];
            }
        }

        messagesList.innerHTML = '';
        try {
            const usersSnapshot = await db.collection('users').get();
            const users = usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            for (const user of users) { // Changed to for...of to use await inside loop
                // Don't show the current logged-in user in the friend list
                if (user.id === currentUserId) continue;

                const li = document.createElement('li');
                li.classList.add('message-item');
                li.dataset.id = user.id;

                let avatarHtml = '';
                if (user.avatar) {
                    avatarHtml = `<img src="${user.avatar}" alt="${user.name}" class="avatar">`;
                } else {
                    const initial = user.name ? user.name.charAt(0).toUpperCase() : '';
                    avatarHtml = `<div class="avatar" style="background-color: #f0f0f0; display: flex; justify-content: center; align-items: center; font-size: 24px; font-weight: bold; color: #555;">${initial}</div>`;
                }

                // Fetch last message for this conversation
                const chatRoomId = [currentUserId, user.id].sort().join('_');
                let lastMessageText = "No messages yet";
                let lastMessageTime = "";

                try {
                    const chatDoc = await db.collection('chats').doc(chatRoomId).get();
                    if (chatDoc.exists && chatDoc.data().lastMessage) {
                        lastMessageText = chatDoc.data().lastMessage;
                        const timestamp = chatDoc.data().lastMessageTimestamp;
                        if (timestamp && timestamp.toDate) {
                            const date = timestamp.toDate();
                            lastMessageTime = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        }
                    }
                } catch (error) {
                    console.error("Error fetching last message for conversation:", chatRoomId, error);
                }
                
                // Determine online status based on lastOnline timestamp
                const onlineStatus = isUserReallyOnline(user.lastOnline) ? 'online' : 'offline';

                li.innerHTML = `
                    <div class="avatar-container">
                        ${avatarHtml}
                        <span class="online-status ${onlineStatus}"></span>
                    </div>
                    <div class="message-content">
                        <strong>${user.name}</strong>
                        <span>${lastMessageText}</span>
                    </div>
                    <span class="message-time">${lastMessageTime}</span>
                `;

                li.addEventListener('click', () => {
                    setActiveConversation(user);
                });

                messagesList.appendChild(li);

                // Start real-time listener for this user's online status
                unsubscribeUserStatuses[user.id] = db.collection('users').doc(user.id)
                    .onSnapshot(docSnapshot => {
                        const userData = docSnapshot.data();
                        // Use isUserReallyOnline for live updates in conversation list
                        const newOnlineStatus = isUserReallyOnline(userData && userData.lastOnline) ? 'online' : 'offline';
                        const statusSpan = li.querySelector('.online-status');
                        if (statusSpan) {
                            statusSpan.classList.remove('online', 'offline');
                            statusSpan.classList.add(newOnlineStatus);
                        }
                    }, error => {
                        console.error("Error listening to user status in conversation list:", user.id, error);
                    });
            }; // End of for...of loop
        } catch (error) {
            console.error("Error fetching users: ", error);
        }
    }

    // Event listener for the new refresh button
    refreshButton.addEventListener('click', () => {
        if (activeConversation) {
            console.log("Refresh button clicked. Reloading messages...");
            listenForActiveChatMessages(activeConversation.id);
        } else {
            console.log("Refresh button clicked, but no active conversation.");
        }
    });

    // Function to update typing status in Firestore
    // This function sets the typing status of `currentUserId` *for* `chatPartnerId`
    async function setTypingStatus(isTyping) {
        if (!currentUserId || !activeChatPartnerId) return;

        // Clear any existing timeout when setting a new status
        if (clearTypingStatusTimeout) {
            clearTimeout(clearTypingStatusTimeout);
            clearTypingStatusTimeout = null;
        }

        try {
            await db.collection('users').doc(currentUserId).collection('typingStatus').doc(activeChatPartnerId).set({
                isTyping: isTyping,
                timestamp: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            console.log(`Typing status set to ${isTyping} for ${activeChatPartnerId}. Timestamp:`, firebase.firestore.FieldValue.serverTimestamp()); // MODIFIED FOR DEBUGGING

            // If setting to true, schedule a timeout to set it to false after inactivity
            if (isTyping) {
                clearTypingStatusTimeout = setTimeout(() => {
                    setTypingStatus(false); // Automatically set to false after inactivity
                }, 1000); // Changed to 1000ms for typing status clear
            }

        } catch (error) {
            console.error("Error setting typing status:", error);
        }
    }

    // Function to debounce typing events (still useful for initial true send)
    function debounce(func, delay) {
        let timeout;
        return function(...args) {
            const context = this;
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(context, args), delay);
        };
    }

    // Listen for chat partner's typing status
    // This function listens for the typing status of `chatPartnerId` *for* `currentUserId`
    function listenForChatPartnerTypingStatus(chatPartnerId) {
        if (unsubscribeTypingStatus) {
            unsubscribeTypingStatus(); // Unsubscribe from previous listener
        }

        if (!currentUserId || !chatPartnerId) {
            // chatPartnerStatusText.textContent = ''; // Clear status if no chat partner
            // chatPartnerOnlineStatus.style.display = 'none'; // Hide dot
            return; // No listener if no chat partner
        }

        // Listen for the chat partner's typing status targeting *this* user
        unsubscribeTypingStatus = db.collection('users').doc(chatPartnerId).collection('typingStatus').doc(currentUserId)
            .onSnapshot(doc => {
                console.log(`Received typing status update for ${chatPartnerId}:`, doc.data()); // Original debug log
                if (doc.exists) {
                    const data = doc.data();
                    console.log("Raw data received:", data); // ADDED FOR DEBUGGING
                    console.log("Data isTyping:", data.isTyping, "Data Timestamp:", data.timestamp ? data.timestamp.toDate() : null); // ADDED FOR DEBUGGING
                    // Check if they are typing and if their timestamp is recent (e.g., within 2 seconds)
                    const isTyping = data.isTyping && (Date.now() - data.timestamp.toDate().getTime() < 2000);
                    console.log("Evaluated isTyping:", isTyping); // ADDED FOR DEBUGGING
                    if (isTyping) {
                        chatPartnerStatusText.textContent = 'Typing...';
                        chatPartnerOnlineStatus.style.display = 'none'; // Hide online dot when typing
                        // Scroll to bottom when typing indicator appears
                        activeChatMessages.scrollTop = activeChatMessages.scrollHeight;
                    } else {
                        // Typing has stopped or document doesn't exist, revert to online status
                        listenForChatPartnerOnlineStatus(chatPartnerId); // Explicitly call to get real online status
                    }
                } else {
                    // If document doesn't exist (e.g., typing status never set or cleared), revert to online status
                    listenForChatPartnerOnlineStatus(chatPartnerId); // Explicitly call to get real online status
                }
            }, error => {
                console.error("Error listening for typing status:", error);
                // On error, revert to online status as a fallback
                listenForChatPartnerOnlineStatus(chatPartnerId); // Explicitly call to get real online status
            });
        console.log(`Listening for typing status of ${chatPartnerId}`);
    }

    // Helper function to determine online status based on lastOnline timestamp
    function isUserReallyOnline(lastOnlineTimestamp) {
        if (!lastOnlineTimestamp) return false; // If no timestamp, assume offline
        const now = firebase.firestore.Timestamp.now().toDate().getTime();
        const lastOnlineTime = lastOnlineTimestamp.toDate().getTime();
        const differenceInSeconds = (now - lastOnlineTime) / 1000;
        return differenceInSeconds < 30; // Consider online if last activity was within 30 seconds
    }

    // New: Function to listen for chat partner's online status
    function listenForChatPartnerOnlineStatus(chatPartnerId) {
        if (unsubscribePartnerStatus) {
            unsubscribePartnerStatus(); // Unsubscribe from previous listener if any
        }

        unsubscribePartnerStatus = db.collection('users').doc(chatPartnerId)
            .onSnapshot(docSnapshot => {
                const userData = docSnapshot.data();
                // Use isUserReallyOnline for live updates in chat header
                const partnerOnlineStatus = isUserReallyOnline(userData && userData.lastOnline) ? 'online' : 'offline';
                
                const currentChatPartnerOnlineStatus = chatWindow.querySelector('.chat-partner-info .online-status');
                const currentChatPartnerStatusText = document.getElementById('chat-partner-status-text');

                if (currentChatPartnerOnlineStatus) {
                    currentChatPartnerOnlineStatus.classList.remove('online', 'offline');
                    currentChatPartnerOnlineStatus.classList.add(partnerOnlineStatus);
                }

                // Always update status text if typing indicator is not active
                // The typing status listener now fully controls overriding this when typing
                currentChatPartnerStatusText.textContent = partnerOnlineStatus.charAt(0).toUpperCase() + partnerOnlineStatus.slice(1);
            }, error => {
                console.error("Error listening to chat partner online status:", error);
            });
    }

    // Call this when setting active conversation
    function setActiveConversation(conversation) {
        activeConversation = conversation;
        activeChatPartnerId = conversation.id; // Ensure activeChatPartnerId is set
        chatPartnerName.textContent = conversation.name;
        chatPartnerAvatar.src = conversation.avatar;
        chatWindow.classList.add('active');
        messagesList.innerHTML = ''; // Clear messages when switching conversations
        listenForActiveChatMessages(conversation.id); // Start listening for messages
        listenForChatPartnerOnlineStatus(conversation.id); // Listen for online status
        listenForChatPartnerTypingStatus(conversation.id); // Listen for typing status

        // Scroll to the bottom of the chat messages after loading
        setTimeout(() => {
            activeChatMessages.scrollTop = activeChatMessages.scrollHeight;
        }, 100);
    }

    function displayChatMessage(docId, sender, text, type, timestamp, animate = false) {
        let msgDiv = document.querySelector(`.message[data-id="${docId}"]`);

        if (!msgDiv) {
            // Create new message div if it doesn't exist
            msgDiv = document.createElement('div');
            msgDiv.classList.add('message', type);
            if (animate) {
                msgDiv.classList.add('message-fade-in');
            }
            msgDiv.dataset.id = docId; // Store Firestore document ID

            const senderNameSpan = document.createElement('span');
            senderNameSpan.classList.add('message-sender');
            senderNameSpan.textContent = type === 'sent' ? 'You' : sender;

            const messageTextSpan = document.createElement('span');
            messageTextSpan.classList.add('message-text');
            messageTextSpan.textContent = text;

            // Create a wrapper for message text and timestamp
            const messageContentWrapper = document.createElement('div');
            messageContentWrapper.classList.add('message-content-wrapper');

            messageContentWrapper.appendChild(messageTextSpan);

            msgDiv.appendChild(senderNameSpan);
            msgDiv.appendChild(messageContentWrapper); // Append the wrapper instead of text directly

            activeChatMessages.appendChild(msgDiv);
        } else {
            // Update existing message (e.g., if timestamp changed from pending) - ensure class is correct
            msgDiv.classList.remove('sent', 'received');
            msgDiv.classList.add(type);
            // Ensure animation class is removed if it was there and not needed for an update
            msgDiv.classList.remove('message-fade-in');
            // Update message text in case it changed (e.g., during edit features later)
            msgDiv.querySelector('.message-text').textContent = text;
        }

        // Always update timestamp (as it might resolve later)
        let messageTimeSpan = msgDiv.querySelector('.message-timestamp');
        if (!messageTimeSpan) {
            messageTimeSpan = document.createElement('span');
            messageTimeSpan.classList.add('message-timestamp');
            // Append timestamp to the new wrapper
            msgDiv.querySelector('.message-content-wrapper').appendChild(messageTimeSpan);
        }
        
        if (timestamp && timestamp.toDate) {
            const date = timestamp.toDate();
            messageTimeSpan.textContent = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else {
            messageTimeSpan.textContent = ''; // Keep empty if timestamp not resolved yet
        }

        activeChatMessages.scrollTop = activeChatMessages.scrollHeight; // Scroll to bottom on new message/update
    }

    function listenForActiveChatMessages(chatPartnerId) {
        activeChatMessages.innerHTML = ''; // Clear messages only once when starting a new chat

        if (!currentUserId) {
            console.error("listenForActiveChatMessages: currentUserId is null. Cannot listen for messages.");
            return; // Cannot listen without currentUserId
        }

        const chatRoomId = [currentUserId, chatPartnerId].sort().join('_');
        console.log("Listen: currentUserId=", currentUserId, "chatPartnerId=", chatPartnerId, "chatRoomId=", chatRoomId);

        // Instead of directly using onSnapshot for rendering, we'll fetch all messages first,
        // then apply the staggered animation, and then set up a new onSnapshot for real-time updates.

        // First, fetch all existing messages to display with animation on refresh/initial load
        db.collection('chats').doc(chatRoomId).collection('messages')
            .orderBy('timestamp', 'asc').get().then(snapshot => {
                activeChatMessages.innerHTML = ''; // Clear messages before adding them with animation
                snapshot.docs.forEach((doc, index) => {
                    const msg = doc.data();
                    const docId = doc.id;
                    let messageType = (msg.senderId === currentUserId) ? 'sent' : 'received';
                    // Apply animation to all messages on initial load/refresh
                    setTimeout(() => {
                        displayChatMessage(docId, msg.sender, msg.text, messageType, msg.timestamp, true);
                    }, index * 50); // Stagger by 50ms
                });
                activeChatMessages.scrollTop = activeChatMessages.scrollHeight; // Scroll to bottom after all animated messages are added
            }).catch(error => {
                console.error("Error fetching initial messages for animation:", error);
            });

        // Then, set up the real-time listener for new messages and updates
        unsubscribeMessages = db.collection('chats').doc(chatRoomId).collection('messages')
            .orderBy('timestamp', 'asc')
            .onSnapshot((snapshot) => {
                snapshot.docChanges().forEach(change => {
                    const msg = change.doc.data();
                    const docId = change.doc.id;
                    let messageType = (msg.senderId === currentUserId) ? 'sent' : 'received';

                    if (change.type === 'added') {
                        // Only animate newly added messages in real-time if not part of initial load
                        // The initial load animation is handled by the .get() above.
                        // To avoid double-animation for initial messages, we check if it's already in DOM.
                        if (!document.querySelector(`.message[data-id="${docId}"]`)) {
                            displayChatMessage(docId, msg.sender, msg.text, messageType, msg.timestamp, true);
                        }
                    } else if (change.type === 'modified') {
                        // Update existing message without re-animating
                        displayChatMessage(docId, msg.sender, msg.text, messageType, msg.timestamp, false);
                    } else if (change.type === 'removed') {
                        const removedMsgDiv = document.querySelector(`.message[data-id="${docId}"]`);
                        if (removedMsgDiv) {
                            removedMsgDiv.remove();
                        }
                    }
                });
                // Only scroll to bottom if new messages are added or existing messages are updated
                // For removed messages, scrolling might not be necessary or desired.
                const addedOrModified = snapshot.docChanges().some(change => change.type === 'added' || change.type === 'modified');
                if (addedOrModified) {
                activeChatMessages.scrollTop = activeChatMessages.scrollHeight;
                }

            }, (error) => {
                console.error("Error listening to messages:", error);
            });
    }

    sendButton.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendMessage();
        } 
    });

    // This is now redundant as setTypingStatus handles the timeout
    // const debouncedSetTypingStatusTrue = debounce(() => setTypingStatus(true), 100); 
    // const debouncedSetTypingStatusFalse = debounce(() => setTypingStatus(false), 2000); 

    messageInput.addEventListener('input', () => {
        if (messageInput.value.length > 0) {
            setTypingStatus(true); // Directly set to true on input
        } else {
            setTypingStatus(false); // If cleared, set to false immediately
        }
    });

    messageInput.addEventListener('blur', () => {
        setTypingStatus(false); // Ensure typing status is false when input loses focus
    });


    function sendMessage() {
        const text = messageInput.value.trim();
        if (text === '' || !activeConversation || !currentUserId) {
            console.warn("Cannot send message: Input empty, no active conversation, or current user not set.");
            return;
        }

        // Clear typing status immediately after sending a message
        setTypingStatus(false); // Explicitly set to false

        console.log("Attempting to send message with:");
        console.log("currentUserId (in sendMessage):", currentUserId);
        console.log("activeConversation.id (in sendMessage):", activeConversation.id);

        const chatRoomId = [currentUserId, activeConversation.id].sort().join('_');
        console.log("chatRoomId (in sendMessage):", chatRoomId);

        db.collection('chats').doc(chatRoomId).collection('messages').add({
            senderId: currentUserId,
            sender: currentUserName,
            receiverId: activeConversation.id,
            receiver: activeConversation.name,
            text: text,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        })
        .then(() => {
            messageInput.value = '';
            console.log("Message sent!");

            db.collection('chats').doc(chatRoomId).set({
                lastMessage: text,
                lastMessageTimestamp: firebase.firestore.FieldValue.serverTimestamp(),
                participants: [currentUserId, activeConversation.id]
            }, { merge: true });

        })
        .catch((error) => {
            console.error("Error sending message:", error);
        });
    }

    backIcon.addEventListener('click', () => {
        if (unsubscribeMessages) {
            unsubscribeMessages();
        }
        if (unsubscribeTypingStatus) { // Unsubscribe from typing status when leaving chat
            unsubscribeTypingStatus();
        }
        if (unsubscribePartnerStatus) { // Unsubscribe from partner online status
            unsubscribePartnerStatus();
        }

        // Unsubscribe all user status listeners when going back to conversations view
        for (const userId in unsubscribeUserStatuses) {
            if (unsubscribeUserStatuses[userId]) {
                unsubscribeUserStatuses[userId]();
                delete unsubscribeUserStatuses[userId];
            }
        }
        
        // Also, ensure your own typing status is cleared when leaving chat
        setTypingStatus(false); // Explicitly set to false

        chatWindow.classList.remove('active');
        conversationsView.classList.remove('hidden');
        activeConversation = null;
    });

    // Event listeners for new chat input icons (placeholders for future features)
    // Removed event listeners for emojiButton and attachFileButton
    

    // Removed event listener for micButton
    

    logoutButton.addEventListener('click', async () => {
        console.log("Logout button clicked!");
        try {
            if (currentUserId) {
                await db.collection('users').doc(currentUserId).update({
                    // Removed: onlineStatus: 'offline' // No longer explicitly set here
                });
                console.log("User lastOnline timestamp updated on logout.");
            }
            await auth.signOut();
            console.log("User logged out.");
            window.location.href = 'login.html';
        } catch (error) {
            console.error("Error logging out:", error);
        }
    });

    // Profile button event listener to open profile section
    if (profileButton) {
        profileButton.addEventListener('click', async () => {
            console.log("Profile button clicked! Opening profile section...");
            profileSection.classList.add('active'); // Slide in profile section
            await loadUserProfileData(); // Load data when opening
        });
    }

    // Profile back button event listener to close profile section
    if (profileBackButton) {
        profileBackButton.addEventListener('click', () => {
            console.log("Profile back button clicked! Closing profile section...");
            profileSection.classList.remove('active'); // Slide out profile section
        });
    }

    // Function to load user profile data
    async function loadUserProfileData() {
        if (!currentUserId) {
            console.warn("loadUserProfileData: currentUserId is null.");
            return;
        }
        try {
            const userDoc = await db.collection('users').doc(currentUserId).get();
            if (userDoc.exists) {
                const userData = userDoc.data();
                profileUserName.textContent = userData.name || 'No Name';
                // profileUserEmail.textContent = auth.currentUser.email || 'No Email'; // Removed as it's now an input
                profileUserAvatar.src = userData.avatar || 'https://randomuser.me/api/portraits/men/1.jpg';
                profileUserBioDisplay.textContent = userData.bio || 'No bio provided.'; // Display bio here
                
                // Update header avatar as well if profile is loaded
                if (myHeaderAvatar) {
                    myHeaderAvatar.src = userData.avatar || 'https://randomuser.me/api/portraits/men/1.jpg';
                }

                // Removed: Update profile online status and text
                // const userOnlineStatus = userData.onlineStatus || 'offline';
                // if (profileOnlineIndicator) {
                //     if (userOnlineStatus === 'online') {
                //         profileOnlineIndicator.style.display = 'inline-block'; // Show green tick
                //     } else {
                //         profileOnlineIndicator.style.display = 'none'; // Hide green tick
                //     }
                // }
                // if (profileUserStatusText) {
                //     profileUserStatusText.textContent = userOnlineStatus.charAt(0).toUpperCase() + userOnlineStatus.slice(1);
                // }

                // profileUserStatus.textContent = userData.onlineStatus || 'Offline'; // Removed
                // profileUserBio.textContent = userData.bio || 'No bio provided.'; // Removed as it's now an input
                // profileUserPhone.textContent = userData.phone || 'Not provided'; // Removed as it's now an input

                // Populate input fields for editing
                profileNameInput.value = userData.name || '';
                profileBioInput.value = userData.bio || '';
                profileUserEmail.value = userData.email || auth.currentUser.email || '';
                profileUserPhone.value = userData.phone || '';

                // Explicitly update displayed name and bio with current data
                profileUserName.textContent = userData.name || auth.currentUser.email.split('@')[0];
                profileUserBioDisplay.textContent = userData.bio || 'No bio provided.';

            } else {
                console.warn("User document not found for current user.");
                profileUserName.textContent = auth.currentUser.email.split('@')[0];
                // profileUserEmail.textContent = auth.currentUser.email || 'No Email'; // Removed
                profileUserAvatar.src = 'https://randomuser.me/api/portraits/men/1.jpg';
                profileUserBioDisplay.textContent = 'No bio provided.'; // Display default bio here
                
                // Removed: if (profileOnlineIndicator) profileOnlineIndicator.style.display = 'none'; // Hide indicator
                // Removed: if (profileUserStatusText) profileUserStatusText.textContent = 'Offline'; // Set default text

                // profileUserStatus.textContent = 'Offline'; // Removed
                // profileUserBio.textContent = 'No bio provided.'; // Removed
                // profileUserPhone.textContent = 'Not provided'; // Removed

                profileNameInput.value = auth.currentUser.email.split('@')[0]; // Set default name if not found
                profileBioInput.value = '';
                profileUserEmail.value = auth.currentUser.email || '';
                profileUserPhone.value = '';
            }
        } catch (error) {
            console.error("Error loading user profile data:", error);
        }
    }

    // Handle image upload
    // Removed: if (uploadImageButton && profileImageUpload) {
    // Removed: uploadImageButton.addEventListener('click', () => {
    // Removed: uploadImageButton.addEventListener('click', () => {
    // Removed: profileImageUpload.click(); // Trigger the hidden file input
    // Removed: });

    // Removed: profileImageUpload.addEventListener('change', async (event) => {
    // Removed: const file = event.target.files[0];
    // Removed: if (!file) {
    // Removed: return;
    // Removed: }

    // Removed: if (!file.type.startsWith('image/')) {
    // Removed: alert("Please upload an image file.");
    // Removed: return;
    // Removed: }

    // Removed: if (file.size > 2 * 1024 * 1024) { // 2MB limit
    // Removed: alert("Image size exceeds 2MB. Please choose a smaller image.");
    // Removed: return;
    // Removed: }

    // Removed: if (!currentUserId) {
    // Removed: console.warn("Cannot upload image: currentUserId is null.");
    // Removed: alert("User not logged in.");
    // Removed: return;
    // Removed: }

    // Removed: try {
    // Removed: // Initialize Firebase Storage
    // Removed: const storage = firebase.storage();
    // Removed: const storageRef = storage.ref();
    // Removed: const avatarRef = storageRef.child(`avatars/${currentUserId}/${file.name}`);

    // Removed: console.log("Uploading image...");
    // Removed: const snapshot = await avatarRef.put(file);
    // Removed: const downloadURL = await snapshot.ref.getDownloadURL();

    // Removed: console.log("Image uploaded, URL:", downloadURL);

    // Removed: // Update user's profile in Firestore with the new avatar URL
    // Removed: await db.collection('users').doc(currentUserId).set({
    // Removed: avatar: downloadURL
    // Removed: }, { merge: true });

    // Removed: console.log("Profile avatar updated successfully!");
    // Removed: alert("Profile picture updated successfully!");
    // Removed: await loadUserProfileData(); // Refresh displayed data

    // Removed: } catch (error) {
    // Removed: console.error("Error uploading image or updating profile:", error);
    // Removed: alert("Failed to upload image or update profile. Please try again.");
    // Removed: }
    // Removed: });

    // Update profile functionality
    if (updateProfileButton) {
        updateProfileButton.addEventListener('click', async () => {
            if (!currentUserId) {
                console.warn("Cannot update profile: currentUserId is null.");
                return;
            }

            const newName = profileNameInput.value.trim();
            const newBio = profileBioInput.value.trim();
            const newEmail = profileUserEmail.value.trim(); // Get new email value
            const newPhone = profileUserPhone.value.trim(); // Get new phone value

            console.log("Update Profile button clicked.");
            console.log("Current User ID:", currentUserId);
            console.log("New Name:", newName);
            console.log("New Bio:", newBio);
            console.log("New Email:", newEmail);
            console.log("New Phone:", newPhone);

            if (newName === '') {
                alert("Name cannot be empty.");
                return;
            }

            try {
                // Prepare update data for Firestore (excluding email, as it's handled separately for Auth)
                const updateData = {
                    name: newName,
                    bio: newBio,
                    phone: newPhone
                };

                // Only attempt to update email if it has changed from the current authenticated user's email
                if (auth.currentUser && auth.currentUser.email !== newEmail) {
                    await auth.currentUser.updateEmail(newEmail);
                    updateData.email = newEmail; // Also update in Firestore if auth update is successful
                    console.log("User authentication email updated.");
                }

                await db.collection('users').doc(currentUserId).set(updateData, { merge: true });
                console.log("Profile name, bio, phone, and potentially email updated successfully!");
                alert("Profile updated successfully!");
                await loadUserProfileData(); // Refresh displayed data
            } catch (error) {
                console.error("Error updating profile:", error);
                // Provide more specific error messages to the user
                if (error.code === 'auth/requires-recent-login') {
                    alert("Please log in again to update your email address. For security reasons, this action requires recent authentication.");
                } else if (error.code === 'auth/invalid-email') {
                    alert("The new email address is invalid. Please enter a valid email.");
                } else if (error.code === 'auth/email-already-in-use') {
                    alert("This email address is already in use by another account.");
                } else {
                    alert("Failed to update profile. Please try again.");
                }
            }
        });
    }
}); 