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


define(function (require, exports, module) {
    "use strict";

    var React = require("react"),
        Fluxxor = require("fluxxor"),
        FluxMixin = Fluxxor.FluxMixin(React),
        _ = require("lodash");

    var Carousel = require("jsx!js/jsx/shared/Carousel");
        
    var FirstLaunch = React.createClass({
        mixins: [FluxMixin],
        
        propTypes: {
            dismissDialog: React.PropTypes.func
        },

        getDefaultProps: function() {
            return {
                dismissDialog: _.identity
            };
        },

        _dismissDialog: function (doNotShowAgain) {
            if (doNotShowAgain) {
                this.getFlux().actions.preferences.setPreference("showFirstLaunch", false);
            }
            this.props.dismissDialog();
        },

        render: function () {
            var firstLaunchCarouselItems = [
                (<div>page 1</div>),
                (<div>page 2</div>)
            ];

            return (
                <div>
                    <h1>Welcome to Recess</h1>
                    <h2 onClick={this._dismissDialog.bind(this, false)}>CLOSE ME</h2>
                    <h2 onClick={this._dismissDialog.bind(this, true)}>CLOSE ME and do not show again</h2>
                    <Carousel>
                        {firstLaunchCarouselItems}
                    </Carousel>
                </div>
            );
        }

    });

    module.exports = FirstLaunch;
});
