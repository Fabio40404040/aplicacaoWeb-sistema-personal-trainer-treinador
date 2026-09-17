import { initAuth } from './modules/auth.js'
import { initNavigation } from './modules/router.js'
import { initDashboard } from './modules/dashboard.js'
import { initForms } from './modules/forms.js'
import { initShortcuts } from './modules/shortcuts.js'
import { initRemoteSync } from './modules/api-client.js'
import { initWebTools } from './modules/web-tools.js'
import { initPublicMenu } from './modules/public-menu.js'
import { initStudentAccess } from './modules/student-access.js'
import { initPersonalAccess } from './modules/personal-access.js'
import { initPasswordControls } from './modules/password-controls.js'
import { initPersonalTestAccess } from './modules/personal-test-access.js'
import { initCredentialSeparation } from './modules/credential-separation.js'
import { initPwa } from './modules/pwa.js'

initCredentialSeparation()
initAuth()
initNavigation()
initDashboard()
initForms()
initShortcuts()
initRemoteSync()
initWebTools()
initPublicMenu()
initStudentAccess()
initPersonalAccess()
initPasswordControls()
initPersonalTestAccess()
initPwa()
