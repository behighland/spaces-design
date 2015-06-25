/*
 * Copyright (c) 2014 Adobe Systems Incorporated. All rights reserved.
 *  
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"), 
 * to deal in the Software without restriction, including without limitation 
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, 
 * and/or sell copies of the Software, and to permit persons to whom the 
 * Software is furnished to do so, subject to the following conditions:
 *  
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *  
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
 * DEALINGS IN THE SOFTWARE.
 * 
 */

define(function (require, exports) {
    "use strict";

    var Promise = require("bluebird");

    var textLayerLib = require("adapter/lib/textLayer"),
        descriptor = require("adapter/ps/descriptor"),
        documentLib = require("adapter/lib/document"),
        layerLib = require("adapter/lib/layer");

    var layerActions = require("./layers"),
        events = require("../events"),
        locks = require("js/locks"),
        collection = require("js/util/collection"),
        locking = require("js/util/locking"),
        math = require("js/util/math"),
        strings = require("i18n!nls/strings");

    /**
     * Minimum and maximum Photoshop-supported font sizes
     * 
     * @const
     * @type {number} 
     */
    var PS_MIN_FONT_SIZE = 0.04,
        PS_MAX_FONT_SIZE = 5400;

    /**
     * play/batchPlay options that allow the canvas to be continually updated, 
     * and history state to be consolidated 
     *
     * @private
     * @param {number} documentID
     * @param {string} name localized name to put into the history state
     * @param {boolean=} coalesce Whether to coalesce this operations history state
     * @return {object} options
     */
    var _getTypeOptions = function (documentID, name, coalesce) {
        return {
            paintOptions: {
                immediateUpdate: true,
                quality: "draft"
            },
            historyStateInfo: {
                name: name,
                target: documentLib.referenceBy.id(documentID),
                coalesce: !!coalesce,
                suppressHistoryStateNotification: !!coalesce
            },
            canExecuteWhileModal : true
        };
    };

    /**
     * Set the post script (in terms of a type family and type style) of the given
     * layers in the given document. This triggers a layer bounds update.
     *
     * @param {Document} document
     * @param {Immutable.Iterable.<Layers>} layers
     * @param {string} postscript Post script name of the described typeface
     * @param {string} family The type face family name, e.g., "Helvetica Neue"
     * @param {string} style The type face style name, e.g., "Oblique"
     * @return {Promise}
     */
    var setPostScript = function (document, layers, postscript, family, style) {
        var layerIDs = collection.pluck(layers, "id"),
            layerRefs = layerIDs.map(textLayerLib.referenceBy.id).toArray();

        var setFacePlayObject = textLayerLib.setPostScript(layerRefs, postscript),
            typeOptions = _getTypeOptions(document.id, strings.ACTIONS.SET_TYPE_FACE),
            setFacePromise = this.dispatchAsync(events.ui.TOGGLE_OVERLAYS, { enabled: false })
                .bind(this)
                .then(function () {
                    locking.playWithLockOverride(document, layers, setFacePlayObject, typeOptions);
                });

        var payload = {
            documentID: document.id,
            layerIDs: layerIDs,
            postscript: postscript,
            family: family,
            style: style
        };

        var dispatchPromise = this.dispatchAsync(events.document.TYPE_FACE_CHANGED, payload);

        return Promise.join(dispatchPromise,
                setFacePromise,
                function () {
                    return this.transfer(layerActions.resetBounds, document, layers);
                }.bind(this));
    };
    setPostScript.reads = [];
    setPostScript.writes = [locks.PS_DOC, locks.JS_DOC];
    setPostScript.modal = true;

    /**
     * Set the type face (in terms of a type family and type style) of the given
     * layers in the given document. This triggers a layer bounds update.
     *
     * @param {Document} document
     * @param {Immutable.Iterable.<Layers>} layers
     * @param {string} family The type face family name, e.g., "Helvetica Neue"
     * @param {string} style The type face style name, e.g., "Oblique"
     * @return {Promise}
     */
    var setFace = function (document, layers, family, style) {
        var layerIDs = collection.pluck(layers, "id"),
            layerRefs = layerIDs.map(textLayerLib.referenceBy.id).toArray();

        var setFacePlayObject = textLayerLib.setFace(layerRefs, family, style),
            typeOptions = _getTypeOptions(document.id, strings.ACTIONS.SET_TYPE_FACE),
            setFacePromise = this.dispatchAsync(events.ui.TOGGLE_OVERLAYS, { enabled: false })
                .bind(this)
                .then(function () {
                    locking.playWithLockOverride(document, layers, setFacePlayObject, typeOptions);
                });

        var payload = {
            documentID: document.id,
            layerIDs: layerIDs,
            family: family,
            style: style
        };

        var dispatchPromise = this.dispatchAsync(events.document.TYPE_FACE_CHANGED, payload);

        return Promise.join(dispatchPromise,
                setFacePromise,
                function () {
                    return this.transfer(layerActions.resetBounds, document, layers);
                }.bind(this));
    };
    setFace.reads = [];
    setFace.writes = [locks.PS_DOC, locks.JS_DOC];
    setFace.modal = true;

    /**
     * Set the type of the given layers in the given document. The alpha value of
     * the color is used to adjust the opacity of the given layers.
     *
     * @param {Document} document
     * @param {Immutable.Iterable.<Layers>} layers
     * @param {Color} color
     * @param {boolean=} coalesce Whether to coalesce this operation's history state
     * @param {boolean=} ignoreAlpha Whether to ignore the alpha value of the
     *  given color and only update the opaque color value.
     * @return {Promise}
     */
    var setColor = function (document, layers, color, coalesce, ignoreAlpha) {
        var layerIDs = collection.pluck(layers, "id"),
            layerRefs = layerIDs.map(textLayerLib.referenceBy.id).toArray(),
            normalizedColor = color.normalizeAlpha(),
            opaqueColor = normalizedColor.opaque(),
            playObject = textLayerLib.setColor(layerRefs, opaqueColor),
            typeOptions = _getTypeOptions(document.id, strings.ACTIONS.SET_TYPE_COLOR, coalesce);

        if (!ignoreAlpha) {
            var opacity = Math.round(normalizedColor.opacity),
                setOpacityPlayObjects = layers.map(function (layer) {
                    var layerRef = [
                        documentLib.referenceBy.id(document.id),
                        layerLib.referenceBy.id(layer.id)
                    ];

                    return layerLib.setOpacity(layerRef, opacity);
                }).toArray();

            playObject = [playObject].concat(setOpacityPlayObjects);
        }

        var setColorPromise = locking.playWithLockOverride(document, layers, playObject, typeOptions),
            payload = {
                documentID: document.id,
                layerIDs: layerIDs,
                color: normalizedColor,
                coalesce: coalesce
            },
            dispatchPromise = this.dispatchAsync(events.document.history.optimistic.TYPE_COLOR_CHANGED, payload);

        return Promise.join(dispatchPromise, setColorPromise);
    };
    setColor.reads = [];
    setColor.writes = [locks.PS_DOC, locks.JS_DOC];
    setColor.modal = true;

    /**
     * Set the type size of the given layers in the given document. This triggers
     * a layer bounds update.
     *
     * @param {Document} document
     * @param {Immutable.Iterable.<Layers>} layers
     * @param {number} size The type size in pixels, e.g., 72
     * @return {Promise}
     */
    var setSize = function (document, layers, size) {
        var layerIDs = collection.pluck(layers, "id"),
            layerRefs = layerIDs.map(textLayerLib.referenceBy.id).toArray();

        // Ensure that size does not exceed PS font size bounds
        size = math.clamp(size, PS_MIN_FONT_SIZE, PS_MAX_FONT_SIZE);

        var setSizePlayObject = textLayerLib.setSize(layerRefs, size, "px"),
            typeOptions = _getTypeOptions(document.id, strings.ACTIONS.SET_TYPE_SIZE),
            setSizePromise = this.dispatchAsync(events.ui.TOGGLE_OVERLAYS, { enabled: false })
                .bind(this)
                .then(function () {
                    locking.playWithLockOverride(document, layers, setSizePlayObject, typeOptions);
                });

        var payload = {
            documentID: document.id,
            layerIDs: layerIDs,
            size: size
        };

        var dispatchPromise = this.dispatchAsync(events.document.TYPE_SIZE_CHANGED, payload);

        return Promise.join(dispatchPromise,
                setSizePromise,
                function () {
                    return this.transfer(layerActions.resetBounds, document, layers);
                }.bind(this));
    };
    setSize.reads = [];
    setSize.writes = [locks.PS_DOC, locks.JS_DOC];
    setSize.modal = true;

    /**
     * Set the tracking value (aka letter-spacing) of the given layers in the given document.
     * This triggers a layer bounds update.
     *
     * @param {Document} document
     * @param {Immutable.Iterable.<Layers>} layers
     * @param {number} tracking The tracking value
     * @return {Promise}
     */
    var setTracking = function (document, layers, tracking) {
        var layerIDs = collection.pluck(layers, "id"),
            layerRefs = layerIDs.map(textLayerLib.referenceBy.id).toArray(),
            psTracking = tracking / 1000; // PS expects tracking values that are 1/1000 what is shown in the UI

        var setTrackingPlayObject = textLayerLib.setTracking(layerRefs, psTracking),
            typeOptions = _getTypeOptions(document.id, strings.ACTIONS.SET_TYPE_TRACKING),
            setTrackingPromise = this.dispatchAsync(events.ui.TOGGLE_OVERLAYS, { enabled: false })
                .bind(this)
                .then(function () {
                    locking.playWithLockOverride(document, layers, setTrackingPlayObject, typeOptions);
                });

        var payload = {
            documentID: document.id,
            layerIDs: layerIDs,
            tracking: tracking
        };

        var dispatchPromise = this.dispatchAsync(events.document.TYPE_TRACKING_CHANGED, payload);

        return Promise.join(dispatchPromise,
            setTrackingPromise,
                function () {
                    return this.transfer(layerActions.resetBounds, document, layers);
                }.bind(this));
    };
    setTracking.reads = [];
    setTracking.writes = [locks.PS_DOC, locks.JS_DOC];
    setTracking.modal = true;

    /**
     * Set the leading value (aka line-spacing) of the given layers in the given document.
     * This triggers a layer bounds update.
     *
     * @param {Document} document
     * @param {Immutable.Iterable.<Layers>} layers
     * @param {?number} leading The leading value in pixels, or if null then auto.
     * @return {Promise}
     */
    var setLeading = function (document, layers, leading) {
        var layerIDs = collection.pluck(layers, "id"),
            layerRefs = layerIDs.map(textLayerLib.referenceBy.id).toArray(),
            autoLeading = leading === null;

        var setLeadingPlayObject = textLayerLib.setLeading(layerRefs, autoLeading, leading, "px"),
            typeOptions = _getTypeOptions(document.id, strings.ACTIONS.SET_TYPE_LEADING),
            setLeadingPromise = this.dispatchAsync(events.ui.TOGGLE_OVERLAYS, { enabled: false })
                .bind(this)
                .then(function () {
                    locking.playWithLockOverride(document, layers, setLeadingPlayObject, typeOptions);
                });

        var payload = {
            documentID: document.id,
            layerIDs: layerIDs,
            leading: leading
        };

        var dispatchPromise = this.dispatchAsync(events.document.TYPE_LEADING_CHANGED, payload);

        return Promise.join(dispatchPromise,
            setLeadingPromise,
                function () {
                    return this.transfer(layerActions.resetBounds, document, layers);
                }.bind(this));
    };
    setLeading.reads = [];
    setLeading.writes = [locks.PS_DOC, locks.JS_DOC];
    setLeading.modal = true;

    /**
     * Set the paragraph alignment of the given layers in the given document.
     * This triggers a layer bounds update.
     *
     * @param {Document} document
     * @param {Immutable.Iterable.<Layers>} layers
     * @param {string} alignment The alignment kind
     * @return {Promise}
     */
    var setAlignment = function (document, layers, alignment) {
        var layerIDs = collection.pluck(layers, "id"),
            layerRefs = layerIDs.map(textLayerLib.referenceBy.id).toArray();

        var setAlignmentPlayObject = textLayerLib.setAlignment(layerRefs, alignment),
            typeOptions = _getTypeOptions(document.id, strings.ACTIONS.SET_TYPE_ALIGNMENT),
            setAlignmentPromise = this.dispatchAsync(events.ui.TOGGLE_OVERLAYS, { enabled: false })
                .bind(this)
                .then(function () {
                    locking.playWithLockOverride(document, layers, setAlignmentPlayObject, typeOptions);
                });

        var payload = {
            documentID: document.id,
            layerIDs: layerIDs,
            alignment: alignment
        };

        var dispatchPromise = this.dispatchAsync(events.document.TYPE_ALIGNMENT_CHANGED, payload);

        return Promise.join(dispatchPromise,
            setAlignmentPromise,
                function () {
                    return this.transfer(layerActions.resetBounds, document, layers);
                }.bind(this));
    };
    setAlignment.reads = [];
    setAlignment.writes = [locks.PS_DOC, locks.JS_DOC];
    setAlignment.modal = true;

    /**
     * Initialize the list of installed fonts from Photoshop.
     *
     * @private
     * @return {Promise}
     */
    var afterStartup = function () {
        return descriptor.getProperty("application", "fontList")
            .bind(this)
            .then(this.dispatch.bind(this, events.font.INIT_FONTS));
    };
    afterStartup.reads = [locks.PS_APP];
    afterStartup.writes = [locks.JS_TYPE];
    afterStartup.modal = true;

    exports.setPostScript = setPostScript;
    exports.setFace = setFace;
    exports.setColor = setColor;
    exports.setSize = setSize;
    exports.setTracking = setTracking;
    exports.setLeading = setLeading;
    exports.setAlignment = setAlignment;

    exports.afterStartup = afterStartup;
});
