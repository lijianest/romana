/*global define, noty */

define(['jquery', 'underscore', 'backbone', 'templates', 'l20nCtx!locales/{{locale}}/strings', 'marionette'], function($, _, Backbone, JST, l10n) {
    'use strict';

    var AlertsView = Backbone.Marionette.ItemView.extend({
        template: JST['app/scripts/templates/alerts.ejs'],
        growlTemplate: JST['app/scripts/templates/growl.ejs'],
        throttleMs: 10000,
        throttleCount: 3,
        krakenFailThreshold: 1000 * 60 * 15,
        initialize: function() {
            this.App = Backbone.Marionette.getOption(this, 'App');
            this.listenTo(this.App.vent, 'app:neterror', this.neterrorHandler);
            this.listenTo(this.App.vent, 'app:configerror', this.configError);
            this.listenTo(this.App.vent, 'krakenHeartBeat:update', this.heartBeat);
            this.listenTo(this.App.vent, 'request:success', this.requestSuccess);
            this.listenTo(this.App.vent, 'request:error', this.requestError);
            _.each(['timeout', 'serverError', 'unexpectedError', 'parserError'], function(fnName) {
                this[fnName] = _.throttle(this[fnName], this.throttleMs);
            }, this);
            this.sessionExpired = _.once(this.sessionExpired);
            this.serverUnreachable = _.once(this.serverUnreachable);
            this.configError = _.once(this.configError);
            this.timeout = _.after(this.throttleCount, this.timeout);
            this.clusterAPITimeout = _.throttle(this.clusterAPITimeout, this.krakenFailThreshold);
            _.bindAll(this, 'neterrorHandler', 'heartBeat', 'requestSuccess', 'requestError', 'configError');
        },
        heartBeat: function(model) {
            if (model) {
                var attrs = model.attributes;
                //jshint camelcase: false
                if (attrs) {
                    var now = Date.now();
                    var deltaSuccessMs = now - attrs.cluster_update_time_unix;
                    // If time since last success exceeds threshold we
                    // have a problem with kraken
                    if (deltaSuccessMs > this.krakenFailThreshold) {
                        var msg = _.extend({}, this.notyDefaults);
                        // kraken's still trying, we suspect cluster
                        // API communication issues
                        this.clusterAPITimeout(msg);
                    }
                }
            }
        },
        commonNotyNotification: {
            layout: 'topRight',
            template: _.template('<div class="noty_message"><span class="noty_text"></span><div class="noty_close"></div></div>'),
            theme: 'growlTheme',
            animation: {
                open: {
                    opacity: 1,
                    height: 'toggle'
                },
                close: {
                    opacity: 0,
                    height: 'toggle'
                },
                easing: 'swing',
                speed: 500
            }
        },
        requestSuccess: function(request) {
            var msg = {
                text: this.growlTemplate({
                    text: request.headline
                }),
                type: 'success',
                timeout: 10000,
            };
            noty(_.extend({}, this.commonNotyNotification, msg));
        },
        requestError: function(request) {
            var msg = {
                text: this.growlTemplate({
                    text: request.headline
                }),
                type: 'error',
            };
            noty(_.extend({}, this.commonNotyNotification, msg));
        },
        notyDefaults: {
            layout: 'top',
            type: 'error'
        },
        timeoutCount: 0,
        error: function(msg) {
            noty(msg);
        },
        warning: function(msg) {
            msg.type = 'warning';
            noty(msg);
        },
        timeout: function(msg) {
            msg.text = l10n.getSync('dashboardUpdateTimeout');
            this.timeoutCount++;
            this.error(msg);
            console.log('timeout count ' + this.timeoutCount);
        },
        clusterAPITimeout: function(msg) {
            msg.text = l10n.getSync('clusterNotResponding');
            this.warning(msg);
        },
        sessionExpired: function(msg) {
            msg = _.extend(msg, {
                text: l10n.getSync('sessionTimeout'),
                buttons: [{
                        addClass: 'btn btn-primary',
                        text: l10n.getSync('loginButton'),
                        onClick: function($noty) {
                            $noty.close();
                            window.location = '/login/';
                        }
                    }
                ]
            });
            this.warning(msg);
        },
        serverError: function(msg, xhr) {
            msg.text = l10n.getSync('serverErrorMessage', xhr);
            this.error(msg);
        },
        unexpectedError: function(msg, xhr) {
            msg.text = l10n.getSync('unexpectedError', xhr);
            this.error(msg);
        },
        serverUnreachable: function(msg, xhr) {
            msg = _.extend(msg, {
                force: true,
                modal: true,
                text: l10n.getSync('serverUnreachable', xhr),
                closeWith: []
            });
            this.error(msg);
            this.error = this.warning = _.identity;
        },
        parserError: function(msg, xhr) {
            msg = _.extend(msg, {
                text: l10n.getSync('JSONParserError', xhr),
                timeout: 10000
            });
            this.error(msg);
        },
        configError: function(str) {
            var msg = _.extend({}, this.notyDefaults, {
                text: str
            });
            this.error(msg);
        },
        neterrorHandler: function(source, xhr) {
            var errorType = xhr.statusText;
            if (!errorType) {
                return;
            }
            var msg = _.extend({}, this.notyDefaults);
            if (errorType === 'timeout') {
                return this.timeout(msg);
            }
            // parsererror doesn't seem to work consistently
            if (errorType === 'parsererror' || (xhr.status === 200 && errorType === 'OK')) {
                return this.parserError(msg, _.extend({
                    source: source
                }, xhr));
            }
            if (xhr.status === 403) {
                return this.sessionExpired(msg);
            }
            if (xhr.status >= 500) {
                return this.serverError(msg, xhr);
            }
            if (xhr.status === 0) {
                return this.serverUnreachable(msg, xhr);
            }
            return this.unexpectedError(msg, xhr);
        }
    });

    return AlertsView;
});
