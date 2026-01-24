self.addEventListener('push', e => {
    const data = e.data.json();
    console.log('Push Received...', data);
    self.registration.showNotification(data.title, {
        body: data.body,
        icon: '/logo.png' // Ensure logo exists or remove
    });
});
