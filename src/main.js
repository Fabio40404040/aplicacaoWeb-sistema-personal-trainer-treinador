import { initAuth } from './modules/auth.js'
import { initNavigation } from './modules/router.js'
import { initDashboard } from './modules/dashboard.js'
import { initForms } from './modules/forms.js'
import { initShortcuts } from './modules/shortcuts.js'
import { initRemoteSync } from './modules/api-client.js'
import { initWebTools } from './modules/web-tools.js'
import { initPublicMenu } from './modules/public-menu.js'
import { initStudentAccess } from './modules/student-access.js'
import { initPasswordControls } from './modules/password-controls.js'

initAuth()
initNavigation()
initDashboard()
initForms()
initShortcuts()
initRemoteSync()
initWebTools()
initPublicMenu()
initStudentAccess()
initPasswordControls()
