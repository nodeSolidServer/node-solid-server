/* global owaspPasswordStrengthTest, TextEncoder, crypto, fetch */
(function () {
  'use strict'

  const PasswordValidator = function (passwordField, repeatedPasswordField) {
    if (
      passwordField === null || passwordField === undefined ||
      repeatedPasswordField === null || repeatedPasswordField === undefined
    ) {
      return
    }

    this.passwordField = passwordField
    this.repeatedPasswordField = repeatedPasswordField

    this.fetchDomNodes()
    this.bindEvents()

    this.currentStrengthLevel = 0
    this.errors = []
  }

  const FEEDBACK_SUCCESS = 'success'
  const FEEDBACK_WARNING = 'warning'
  const FEEDBACK_ERROR = 'error'

  const ICON_SUCCESS = 'glyphicon-ok'
  const ICON_WARNING = 'glyphicon-warning-sign'
  const ICON_ERROR = 'glyphicon-remove'

  const VALIDATION_SUCCESS = 'has-success'
  const VALIDATION_WARNING = 'has-warning'
  const VALIDATION_ERROR = 'has-error'

  const STRENGTH_PROGRESS_0 = 'progress-bar-danger level-0'
  const STRENGTH_PROGRESS_1 = 'progress-bar-danger level-1'
  const STRENGTH_PROGRESS_2 = 'progress-bar-warning level-2'
  const STRENGTH_PROGRESS_3 = 'progress-bar-success level-3'
  const STRENGTH_PROGRESS_4 = 'progress-bar-success level-4'

  /**
   * Prefetch all dom nodes at initialisation in order to gain time at execution since DOM manipulations
   * are really time consuming
   */
  PasswordValidator.prototype.fetchDomNodes = function () {
    this.form = this.passwordField.closest('form')

    this.disablePasswordChecks = this.passwordField.classList.contains('disable-password-checks')

    this.passwordGroup = this.passwordField.closest('.form-group')
    this.passwordFeedback = this.passwordGroup.querySelector('.form-control-feedback')
    this.passwordStrengthMeter = this.passwordGroup.querySelector('.progress-bar')
    this.passwordHelpText = this.passwordGroup.querySelector('.help-block')

    this.repeatedPasswordGroup = this.repeatedPasswordField.closest('.form-group')
    this.repeatedPasswordFeedback = this.repeatedPasswordGroup.querySelector('.form-control-feedback')
  }

  PasswordValidator.prototype.bindEvents = function () {
    this.passwordField.addEventListener('focus', this.resetPasswordFeedback.bind(this))
    this.passwordField.addEventListener('keyup', this.instantFeedbackForPassword.bind(this))
    this.repeatedPasswordField.addEventListener('keyup', this.validateRepeatedPassword.bind(this))
    this.passwordField.addEventListener('blur', this.validatePassword.bind(this))
  }

  /**
   * Events Listeners
   */

  PasswordValidator.prototype.resetPasswordFeedback = function () {
    this.errors = []
    this.resetValidation(this.passwordGroup)
    this.resetFeedbackIcon(this.passwordFeedback)
    if (!this.disablePasswordChecks) {
      this.displayPasswordErrors()
      this.instantFeedbackForPassword()
    }
  }

  /**
   * Validate password on the fly to provide the user a visual strength meter
   */
  PasswordValidator.prototype.instantFeedbackForPassword = function () {
    const passwordStrength = this.getPasswordStrength(this.passwordField.value)
    const strengthLevel = this.getStrengthLevel(passwordStrength)

    if (this.currentStrengthLevel === strengthLevel) {
      return
    }

    this.currentStrengthLevel = strengthLevel

    this.updateStrengthMeter()

    if (this.repeatedPasswordField.value !== '') {
      this.updateRepeatedPasswordFeedback()
    }
  }

  /**
   * Validate password and display the error(s) message(s)
   */
  PasswordValidator.prototype.validatePassword = function () {
    this.errors = []
    const password = this.passwordField.value

    if (!this.disablePasswordChecks) {
      const passwordStrength = this.getPasswordStrength(password)
      this.currentStrengthLevel = this.getStrengthLevel(passwordStrength)

      if (passwordStrength.errors) {
        this.addPasswordError(passwordStrength.errors)
      }

      this.checkLeakedPassword(password).then(this.handleLeakedPasswordResponse.bind(this))
    }

    this.setPasswordFeedback()
  }

  /**
   * Validate the repeated password upon typing
   */
  PasswordValidator.prototype.validateRepeatedPassword = function () {
    this.updateRepeatedPasswordFeedback()
  }

  /**
   * User Feedback manipulators
   */

  /**
   * Update the strength meter based on OWASP feedback
   */
  PasswordValidator.prototype.updateStrengthMeter = function () {
    this.resetStrengthMeter()

    this.passwordStrengthMeter.classList.add.apply(
      this.passwordStrengthMeter.classList,
      this.tokenize(this.getStrengthLevelProgressClass())
    )
  }

  PasswordValidator.prototype.setPasswordFeedback = function () {
    const feedback = this.getFeedbackFromLevel()
    this.updateStrengthMeter()
    this.displayPasswordErrors()
    this.setFeedbackForField(feedback, this.passwordField)
  }

  /**
   * Update the repeated password feedback icon and color
   */
  PasswordValidator.prototype.updateRepeatedPasswordFeedback = function () {
    const feedback = this.checkPasswordFieldsEquality() ? FEEDBACK_SUCCESS : FEEDBACK_ERROR
    this.setFeedbackForField(feedback, this.repeatedPasswordField)
  }

  /**
   * Display the given feedback on the field
   * @param {string} feedback success|error|warning
   * @param {HTMLElement} field
   */
  PasswordValidator.prototype.setFeedbackForField = function (feedback, field) {
    const formGroup = this.getFormGroupElementForField(field)
    const visualFeedback = this.getFeedbackElementForField(field)

    this.resetValidation(formGroup)
    this.resetFeedbackIcon(visualFeedback)

    visualFeedback.classList.remove('hidden')

    visualFeedback.classList
      .add
      .apply(
        visualFeedback.classList,
        this.tokenize(this.getFeedbackIconClass(feedback))
      )

    formGroup.classList
      .add
      .apply(
        formGroup.classList,
        this.tokenize(this.getValidationClass(feedback))
      )
  }

  /**
   * Password Strength Helpers
   */

  /**
   * Get OWASP feedback on the given password. Returns false if the password is empty
   * @param password
   * @returns {object|false}
   */
  PasswordValidator.prototype.getPasswordStrength = function (password) {
    if (password === '') {
      return false
    }
    return owaspPasswordStrengthTest.test(password)
  }

  /**
   * Get the password strength level based on password strength feedback object given by OWASP
   * @param passwordStrength
   * @returns {number}
   */
  PasswordValidator.prototype.getStrengthLevel = function (passwordStrength) {
    if (passwordStrength === false) {
      return 0
    }
    if (passwordStrength.requiredTestErrors.length !== 0) {
      return 1
    }

    if (passwordStrength.strong === false) {
      return 2
    }

    if (passwordStrength.isPassphrase === false || passwordStrength.optionalTestErrors.length !== 0) {
      return 3
    }

    return 4
  }

  PasswordValidator.prototype.LEVEL_TO_FEEDBACK_MAP = [
    FEEDBACK_ERROR,
    FEEDBACK_ERROR,
    FEEDBACK_WARNING,
    FEEDBACK_SUCCESS,
    FEEDBACK_SUCCESS
  ]

  /**
   * @returns {string}
   */
  PasswordValidator.prototype.getFeedbackFromLevel = function () {
    return this.LEVEL_TO_FEEDBACK_MAP[this.currentStrengthLevel]
  }

  PasswordValidator.prototype.LEVEL_TO_PROGRESS_MAP = [
    STRENGTH_PROGRESS_0,
    STRENGTH_PROGRESS_1,
    STRENGTH_PROGRESS_2,
    STRENGTH_PROGRESS_3,
    STRENGTH_PROGRESS_4
  ]

  /**
   * Get the CSS class for the meter based on the current level
   */
  PasswordValidator.prototype.getStrengthLevelProgressClass = function () {
    return this.LEVEL_TO_PROGRESS_MAP[this.currentStrengthLevel]
  }

  PasswordValidator.prototype.addPasswordError = function (error) {
    this.errors.push(...(Array.isArray(error) ? error : [error]))
  }

  PasswordValidator.prototype.displayPasswordErrors = function () {
    // Erase the error list content
    while (this.passwordHelpText.firstChild) {
      this.passwordHelpText.removeChild(this.passwordHelpText.firstChild)
    }

    // Add the errors in the stack to the DOM
    this.errors.map((error) => {
      let text = document.createTextNode(error)
      let paragraph = document.createElement('p')
      paragraph.appendChild(text)
      this.passwordHelpText.appendChild(paragraph)
    })
  }

  PasswordValidator.prototype.FEEDBACK_TO_ICON_MAP = []
  PasswordValidator.prototype.FEEDBACK_TO_ICON_MAP[FEEDBACK_SUCCESS] = ICON_SUCCESS
  PasswordValidator.prototype.FEEDBACK_TO_ICON_MAP[FEEDBACK_WARNING] = ICON_WARNING
  PasswordValidator.prototype.FEEDBACK_TO_ICON_MAP[FEEDBACK_ERROR] = ICON_ERROR

  /**
   * @param success|error|warning feedback
   */
  PasswordValidator.prototype.getFeedbackIconClass = function (feedback) {
    return this.FEEDBACK_TO_ICON_MAP[feedback]
  }

  PasswordValidator.prototype.FEEDBACK_TO_VALIDATION_MAP = []
  PasswordValidator.prototype.FEEDBACK_TO_VALIDATION_MAP[FEEDBACK_SUCCESS] = VALIDATION_SUCCESS
  PasswordValidator.prototype.FEEDBACK_TO_VALIDATION_MAP[FEEDBACK_WARNING] = VALIDATION_WARNING
  PasswordValidator.prototype.FEEDBACK_TO_VALIDATION_MAP[FEEDBACK_ERROR] = VALIDATION_ERROR

  /**
   * @param success|error|warning feedback
   */
  PasswordValidator.prototype.getValidationClass = function (feedback) {
    return this.FEEDBACK_TO_VALIDATION_MAP[feedback]
  }

  /**
   * Validators
   */

  /**
   * Check if both password fields are equal
   * @returns {boolean}
   */
  PasswordValidator.prototype.checkPasswordFieldsEquality = function () {
    return this.passwordField.value === this.repeatedPasswordField.value
  }

  /**
   * Check if the password is leaked
   * @param password
   */
  PasswordValidator.prototype.checkLeakedPassword = function (password) {
    const url = 'https://api.pwnedpasswords.com/range/'

    return new Promise(function (resolve, reject) {
      this.sha1(password).then((digest) => {
        const preFix = digest.slice(0, 5)
        let suffix = digest.slice(5, digest.length)
        suffix = suffix.toUpperCase()

        return fetch(url + preFix)
          .then(function (response) {
            return response.text()
          })
          .then(function (data) {
            resolve(data.indexOf(suffix) > -1)
          })
          .catch(function (err) {
            reject(err)
          })
      })
    }.bind(this))
  }

  PasswordValidator.prototype.handleLeakedPasswordResponse = function (hasPasswordLeaked) {
    if (hasPasswordLeaked === true) {
      this.currentStrengthLevel--
      this.addPasswordError('This password was exposed in a data breach. Please use a more secure alternative one!')
    }

    this.setPasswordFeedback()
  }

  /**
   * CSS Classes reseters
   */

  PasswordValidator.prototype.resetValidation = function (el) {
    const tokenizedClasses = this.tokenize(
      VALIDATION_ERROR,
      VALIDATION_WARNING,
      VALIDATION_SUCCESS
    )

    el.classList.remove.apply(
      el.classList,
      tokenizedClasses
    )
  }

  PasswordValidator.prototype.resetFeedbackIcon = function (el) {
    const tokenizedClasses = this.tokenize(
      ICON_ERROR,
      ICON_WARNING,
      ICON_SUCCESS
    )

    el.classList.remove.apply(
      el.classList,
      tokenizedClasses
    )
  }

  PasswordValidator.prototype.resetStrengthMeter = function () {
    const tokenizedClasses = this.tokenize(
      STRENGTH_PROGRESS_1,
      STRENGTH_PROGRESS_2,
      STRENGTH_PROGRESS_3,
      STRENGTH_PROGRESS_4
    )

    this.passwordStrengthMeter.classList.remove.apply(
      this.passwordStrengthMeter.classList,
      tokenizedClasses
    )
  }

  /**
   * Helpers
   */

  PasswordValidator.prototype.getFormGroupElementForField = function (field) {
    if (field === this.passwordField) {
      return this.passwordGroup
    }

    if (field === this.repeatedPasswordField) {
      return this.repeatedPasswordGroup
    }
  }

  PasswordValidator.prototype.getFeedbackElementForField = function (field) {
    if (field === this.passwordField) {
      return this.passwordFeedback
    }

    if (field === this.repeatedPasswordField) {
      return this.repeatedPasswordFeedback
    }
  }

  /**
   * Returns an array of strings ready to be applied on classList.add or classList.remove
   * @returns {string[]}
   */
  PasswordValidator.prototype.tokenize = function () {
    let tokenArray = []
    for (let i in arguments) {
      tokenArray.push(arguments[i])
    }
    return tokenArray.join(' ').split(' ')
  }

  PasswordValidator.prototype.sha1 = function (str) {
    let buffer = new TextEncoder('utf-8').encode(str)

    return crypto.subtle.digest('SHA-1', buffer).then((hash) => {
      return this.hex(hash)
    })
  }

  PasswordValidator.prototype.hex = function (buffer) {
    let hexCodes = []
    let view = new DataView(buffer)
    for (let i = 0; i < view.byteLength; i += 4) {
      let value = view.getUint32(i)
      let stringValue = value.toString(16)
      const padding = '00000000'
      let paddedValue = (padding + stringValue).slice(-padding.length)
      hexCodes.push(paddedValue)
    }
    return hexCodes.join('')
  }

  new PasswordValidator(
    document.getElementById('password'),
    document.getElementById('repeat_password')
  )
})()
