import { createApp } from 'vue'
import App from './App.vue'
import './assets/main.css'
import './stores/settings.js'
import StatusBadge from './components/StatusBadge.vue'

const app = createApp(App)
app.component('StatusBadge', StatusBadge)
app.mount('#app')
