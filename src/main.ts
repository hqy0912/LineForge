import { createApp } from 'vue'
import './style.css'
import 'element-plus/es/components/message-box/style/css'
import App from './App.vue'
import { i18n } from './i18n'

createApp(App).use(i18n).mount('#app')
