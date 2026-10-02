import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './style.css'
import { installFeedbackDiagnostics } from './composables/useFeedbackDiagnostics'

console.log('Welcome to codexui. github: https://github.com/friuns2/codexUI')

installFeedbackDiagnostics()

createApp(App).use(router).mount('#app')
