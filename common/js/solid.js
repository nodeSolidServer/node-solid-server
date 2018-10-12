/* global owaspPasswordStrengthTest, TextEncoder, crypto */
(function () {
  'use strict'

  var PasswordValidator = function (passwordField, repeatedPasswordField) {
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

  PasswordValidator.prototype.FEEDBACK_SUCCESS = 'success'
  PasswordValidator.prototype.FEEDBACK_WARNING = 'warning'
  PasswordValidator.prototype.FEEDBACK_ERROR = 'error'

  PasswordValidator.prototype.ICON_SUCCESS = 'glyphicon-ok'
  PasswordValidator.prototype.ICON_WARNING = 'glyphicon-warning-sign'
  PasswordValidator.prototype.ICON_ERROR = 'glyphicon-remove'

  PasswordValidator.prototype.VALIDATION_SUCCESS = 'has-success'
  PasswordValidator.prototype.VALIDATION_WARNING = 'has-warning'
  PasswordValidator.prototype.VALIDATION_ERROR = 'has-error'

  PasswordValidator.prototype.STRENGTH_PROGRESS_0 = 'progress-bar-danger level-0'
  PasswordValidator.prototype.STRENGTH_PROGRESS_1 = 'progress-bar-danger level-1'
  PasswordValidator.prototype.STRENGTH_PROGRESS_2 = 'progress-bar-warning level-2'
  PasswordValidator.prototype.STRENGTH_PROGRESS_3 = 'progress-bar-success level-3'
  PasswordValidator.prototype.STRENGTH_PROGRESS_4 = 'progress-bar-success level-4'

  /**
   * Prefetch all dom nodes at initialisation in order to gain time at execution since DOM manipulations
   * are really time consuming
   */
  PasswordValidator.prototype.fetchDomNodes = function () {
    this.form = this.passwordField.closest('form')

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
    this.displayPasswordErrors()
    this.instantFeedbackForPassword()
  }

  /**
   * Validate password on the fly to provide the user a visual strength meter
   */
  PasswordValidator.prototype.instantFeedbackForPassword = function () {
    var passwordStrength = this.getPasswordStrength(this.passwordField.value)
    var strengthLevel = this.getStrengthLevel(passwordStrength)

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
    var password = this.passwordField.value
    var passwordStrength = this.getPasswordStrength(password)
    this.currentStrengthLevel = this.getStrengthLevel(passwordStrength)

    if (passwordStrength.errors) {
      this.addPasswordError(passwordStrength.errors)
    }

    this.checkLeakedPassword(password).then(this.handleLeakedPasswordResponse.bind(this))

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
    var feedback = this.getFeedbackFromLevel()
    this.updateStrengthMeter()
    this.displayPasswordErrors()
    this.setFeedbackForField(feedback, this.passwordField)
  }

  /**
   * Update the repeated password feedback icon and color
   */
  PasswordValidator.prototype.updateRepeatedPasswordFeedback = function () {
    var feedback = this.checkPasswordFieldsEquality() ? this.FEEDBACK_SUCCESS : this.FEEDBACK_ERROR
    this.setFeedbackForField(feedback, this.repeatedPasswordField)
  }

  /**
   * Display the given feedback on the field
   * @param {string} feedback success|error|warning
   * @param {HTMLElement} field
   */
  PasswordValidator.prototype.setFeedbackForField = function (feedback, field) {
    var formGroup = this.getFormGroupElementForField(field)
    var visualFeedback = this.getFeedbackElementForField(field)

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

  PasswordValidator.prototype.LEVEL_TO_FEEDBACK_MAP = []
  PasswordValidator.prototype.LEVEL_TO_FEEDBACK_MAP[0] = PasswordValidator.prototype.LEVEL_TO_FEEDBACK_MAP[1] = PasswordValidator.prototype.FEEDBACK_ERROR
  PasswordValidator.prototype.LEVEL_TO_FEEDBACK_MAP[2] = PasswordValidator.prototype.FEEDBACK_WARNING
  PasswordValidator.prototype.LEVEL_TO_FEEDBACK_MAP[3] = PasswordValidator.prototype.LEVEL_TO_FEEDBACK_MAP[4] = PasswordValidator.prototype.FEEDBACK_SUCCESS

  /**
   * @returns {string}
   */
  PasswordValidator.prototype.getFeedbackFromLevel = function () {
    return this.LEVEL_TO_FEEDBACK_MAP[this.currentStrengthLevel]
  }

  PasswordValidator.prototype.LEVEL_TO_PROGRESS_MAP = []
  PasswordValidator.prototype.LEVEL_TO_PROGRESS_MAP[0] = PasswordValidator.prototype.STRENGTH_PROGRESS_0
  PasswordValidator.prototype.LEVEL_TO_PROGRESS_MAP[1] = PasswordValidator.prototype.STRENGTH_PROGRESS_1
  PasswordValidator.prototype.LEVEL_TO_PROGRESS_MAP[2] = PasswordValidator.prototype.STRENGTH_PROGRESS_2
  PasswordValidator.prototype.LEVEL_TO_PROGRESS_MAP[3] = PasswordValidator.prototype.STRENGTH_PROGRESS_3
  PasswordValidator.prototype.LEVEL_TO_PROGRESS_MAP[4] = PasswordValidator.prototype.STRENGTH_PROGRESS_4

  /**
   * Get the CSS class for the meter based on the current level
   */
  PasswordValidator.prototype.getStrengthLevelProgressClass = function () {
    return this.LEVEL_TO_PROGRESS_MAP[this.currentStrengthLevel]
  }

  PasswordValidator.prototype.addPasswordError = function (error) {
    if (Array.isArray(error)) {
      for (var i = 0, ln = error.length; i < ln; i++) {
        this.addPasswordError(error[i])
      }
      return
    }

    this.errors.push(error)
  }

  PasswordValidator.prototype.displayPasswordErrors = function () {
    this.passwordHelpText.innerHTML = '<p>' + this.errors.join('</p><p>') + '</p>'
  }

  PasswordValidator.prototype.FEEDBACK_TO_ICON_MAP = []
  PasswordValidator.prototype.FEEDBACK_TO_ICON_MAP[PasswordValidator.prototype.FEEDBACK_SUCCESS] = PasswordValidator.prototype.ICON_SUCCESS
  PasswordValidator.prototype.FEEDBACK_TO_ICON_MAP[PasswordValidator.prototype.FEEDBACK_WARNING] = PasswordValidator.prototype.ICON_WARNING
  PasswordValidator.prototype.FEEDBACK_TO_ICON_MAP[PasswordValidator.prototype.FEEDBACK_ERROR] = PasswordValidator.prototype.ICON_ERROR

  /**
   * @param success|error|warning feedback
   */
  PasswordValidator.prototype.getFeedbackIconClass = function (feedback) {
    return this.FEEDBACK_TO_ICON_MAP[feedback]
  }

  PasswordValidator.prototype.FEEDBACK_TO_VALIDATION_MAP = []
  PasswordValidator.prototype.FEEDBACK_TO_VALIDATION_MAP[PasswordValidator.prototype.FEEDBACK_SUCCESS] = PasswordValidator.prototype.VALIDATION_SUCCESS
  PasswordValidator.prototype.FEEDBACK_TO_VALIDATION_MAP[PasswordValidator.prototype.FEEDBACK_WARNING] = PasswordValidator.prototype.VALIDATION_WARNING
  PasswordValidator.prototype.FEEDBACK_TO_VALIDATION_MAP[PasswordValidator.prototype.FEEDBACK_ERROR] = PasswordValidator.prototype.VALIDATION_ERROR

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
    var url = 'https://api.pwnedpasswords.com/range/'

    return new Promise(function (resolve, reject) {
      this.sha1(password).then((digest) => {
        var preFix = digest.slice(0, 5)
        var suffix = digest.slice(5, digest.length)
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
    var tokenizedClasses = this.tokenize(
      this.VALIDATION_ERROR,
      this.VALIDATION_WARNING,
      this.VALIDATION_SUCCESS
    )

    el.classList.remove.apply(
      el.classList,
      tokenizedClasses
    )
  }

  PasswordValidator.prototype.resetFeedbackIcon = function (el) {
    var tokenizedClasses = this.tokenize(
      this.ICON_ERROR,
      this.ICON_WARNING,
      this.ICON_SUCCESS
    )

    el.classList.remove.apply(
      el.classList,
      tokenizedClasses
    )
  }

  PasswordValidator.prototype.resetStrengthMeter = function () {
    var tokenizedClasses = this.tokenize(
      this.STRENGTH_PROGRESS_1,
      this.STRENGTH_PROGRESS_2,
      this.STRENGTH_PROGRESS_3,
      this.STRENGTH_PROGRESS_4
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
    var tokenArray = []
    for (var i in arguments) {
      tokenArray.push(arguments[i])
    }
    return tokenArray.join(' ').split(' ')
  }

  PasswordValidator.prototype.sha1 = function (str) {
    let buffer = new TextEncoder('utf-8').encode(str)

    return crypto.subtle.digest('SHA-1', buffer).then(function (hash) {
      return this.hex(hash)
    }.bind(this))
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
