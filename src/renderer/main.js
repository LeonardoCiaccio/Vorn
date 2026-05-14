import { createApp } from 'vue'
import App from './App.vue'
import './assets/main.css'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import './stores/settings.js'
import StatusBadge from './components/StatusBadge.vue'
import { i18n } from './i18n.js'

const app = createApp(App)
app.use(i18n)
app.component('StatusBadge', StatusBadge)
app.mount('#app')
