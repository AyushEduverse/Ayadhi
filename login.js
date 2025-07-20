document.addEventListener('DOMContentLoaded', () => {
    const loginSection = document.getElementById('login-section');
    const signupSection = document.getElementById('signup-section');
    const showSignupLink = document.getElementById('show-signup');
    const showLoginLink = document.getElementById('show-login');

    const loginEmailInput = document.getElementById('login-email');
    const loginPasswordInput = document.getElementById('login-password');
    const loginButton = document.getElementById('login-button');
    const authMessageLogin = document.getElementById('auth-message-login');
    const loginPasswordToggle = loginSection.querySelector('.password-toggle');

    const signupFullNameInput = document.getElementById('signup-full-name');
    const signupEmailInput = document.getElementById('signup-email');
    const signupPasswordInput = document.getElementById('signup-password');
    const signupConfirmPasswordInput = document.getElementById('signup-confirm-password');
    const signupButton = document.getElementById('signup-button');
    const authMessageSignup = document.getElementById('auth-message-signup');
    const signupPasswordToggle = signupSection.querySelector('.password-toggle');
    const termsAgreeCheckbox = document.getElementById('terms-agree');

    const auth = firebase.auth();
    const db = firebase.firestore();

    // Function to toggle password visibility
    function togglePasswordVisibility(inputElement, toggleIcon) {
        if (inputElement.type === 'password') {
            inputElement.type = 'text';
            toggleIcon.textContent = 'visibility';
        } else {
            inputElement.type = 'password';
            toggleIcon.textContent = 'visibility_off';
        }
    }

    // Event listeners for password toggles
    if (loginPasswordToggle) {
        loginPasswordToggle.addEventListener('click', () => {
            togglePasswordVisibility(loginPasswordInput, loginPasswordToggle);
        });
    }
    // Select all password toggles within the signup section
    const signupPasswordToggles = signupSection.querySelectorAll('.password-toggle');
    if (signupPasswordToggles.length > 0) {
        signupPasswordToggles.forEach(toggleIcon => {
            toggleIcon.addEventListener('click', (event) => {
                const targetInput = event.target.closest('.input-group').querySelector('input[type="password"], input[type="text"]');
                togglePasswordVisibility(targetInput, event.target);
            });
        });
    }

    // Function to switch between login and signup forms
    function showLoginForm() {
        loginSection.classList.add('active');
        loginSection.classList.remove('hidden');
        signupSection.classList.add('hidden');
        signupSection.classList.remove('active');
        authMessageLogin.textContent = ''; // Clear messages
        authMessageSignup.textContent = '';
        // Clear inputs when switching
        loginEmailInput.value = '';
        loginPasswordInput.value = '';
        signupFullNameInput.value = '';
        signupEmailInput.value = '';
        signupPasswordInput.value = '';
        signupConfirmPasswordInput.value = '';
        if (termsAgreeCheckbox) {
            termsAgreeCheckbox.checked = false;
            signupButton.disabled = true; // Disable signup button initially
        }
    }

    function showSignupForm() {
        signupSection.classList.add('active');
        signupSection.classList.remove('hidden');
        loginSection.classList.add('hidden');
        loginSection.classList.remove('active');
        authMessageLogin.textContent = ''; // Clear messages
        authMessageSignup.textContent = '';
        // Clear inputs when switching
        loginEmailInput.value = '';
        loginPasswordInput.value = '';
        signupFullNameInput.value = '';
        signupEmailInput.value = '';
        signupPasswordInput.value = '';
        signupConfirmPasswordInput.value = '';
        if (termsAgreeCheckbox) {
            termsAgreeCheckbox.checked = false;
            signupButton.disabled = true; // Disable signup button initially
        }
    }

    // Event listener for terms and conditions checkbox
    if (termsAgreeCheckbox) {
        termsAgreeCheckbox.addEventListener('change', () => {
            signupButton.disabled = !termsAgreeCheckbox.checked;
        });
    }

    // Event listeners for toggle links
    showSignupLink.addEventListener('click', (e) => {
        e.preventDefault();
        showSignupForm();
    });

    showLoginLink.addEventListener('click', (e) => {
        e.preventDefault();
        showLoginForm();
    });

    // Initial state: show login form and disable signup button
    showLoginForm();
    if (signupButton) {
        signupButton.disabled = true; // Ensure button is disabled on load
    }

    // Check if user is already logged in
    auth.onAuthStateChanged(user => {
        if (user) {
            // User is signed in, redirect to home page
            window.location.href = 'index.html';
        }
    });

    signupButton.addEventListener('click', async () => {
        const fullName = signupFullNameInput.value.trim();
        const email = signupEmailInput.value.trim();
        const password = signupPasswordInput.value;
        const confirmPassword = signupConfirmPasswordInput.value;

        if (password !== confirmPassword) {
            authMessageSignup.textContent = 'Error: Passwords do not match.';
            return;
        }

        if (termsAgreeCheckbox && !termsAgreeCheckbox.checked) {
            authMessageSignup.textContent = 'Please agree to the Terms & Conditions.';
            return;
        }

        try {
            const userCredential = await auth.createUserWithEmailAndPassword(email, password);
            const user = userCredential.user;

            // Save user data to Firestore
            await db.collection('users').doc(user.uid).set({
                name: fullName,
                email: email,
                avatar: '',
                onlineStatus: 'online',
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            authMessageSignup.textContent = 'Sign up successful! Redirecting...';
            window.location.href = 'index.html';
        } catch (error) {
            authMessageSignup.textContent = `Error: ${error.message}`;
            console.error("Signup Error:", error);
        }
    });

    loginButton.addEventListener('click', async () => {
        const email = loginEmailInput.value.trim();
        const password = loginPasswordInput.value;

        try {
            await auth.signInWithEmailAndPassword(email, password);
            authMessageLogin.textContent = 'Login successful! Redirecting...';
            window.location.href = 'index.html';
        } catch (error) {
            authMessageLogin.textContent = `Error: ${error.message}`;
            console.error("Login Error:", error);
        }
    });
}); 