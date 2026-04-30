import { createApp } from 'vue'
import App from './App.vue'
import './assets/main.css'
import Toggle from './components/Toggle.vue'
import SectionHeader from './components/SectionHeader.vue'
import SettingRow from './components/SettingRow.vue'
import Divider from './components/Divider.vue'
import StatusBadge from './components/StatusBadge.vue'

const app = createApp(App)
app.component('Toggle', Toggle)
app.component('SectionHeader', SectionHeader)
app.component('SettingRow', SettingRow)
app.component('Divider', Divider)
app.component('StatusBadge', StatusBadge)
app.mount('#app')
