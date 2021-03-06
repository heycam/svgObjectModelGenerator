// Copyright (c) 2014 Adobe Systems Incorporated. All rights reserved.
// 
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, bitwise: true */
/*global define: true, require: true, module: true */

/* Help construct the svgOM */

(function () {
"use strict";
    
    var omgStyles = require("./svgOMGeneratorStyles.js"),
        omgUtils = require("./svgOMGeneratorUtils.js"),
        round1k = function (x) {
            return Math.round( x * 1000 ) / 1000;
        },
        _boundInPx = function (bnd, dpi) {
            
            if (typeof bnd === "number") {
                return bnd;
            }
            if (bnd.units === "pointsUnit") {
                return omgUtils.pt2px(bnd.value, dpi);
            } else if (bnd.units === "millimetersUnit") {
                return omgUtils.mm2px(bnd.value, dpi);
            } else if (isFinite(bnd.value)) {
                console.log("unfamiliar bounds unit for text = " + JSON.stringify(bnd));
                return bnd.value;
            }
            return parseInt(bnd, 10);
        };

	function SVGOMGeneratorText() {
        
        this.textComponentOrigin = function (layer, fn) {
            if (layer.text &&
                layer.text.textStyleRange && layer.text.textStyleRange[0] &&
                layer.text.paragraphStyleRange && layer.text.paragraphStyleRange[0] &&
                layer.text.textShape && layer.text.textShape[0].char) {
                return fn(layer.text);
            }
            return false;
        };

        this._computeTextPath = function (listKey, isBoxMode, boxOrientation, bounds, textHeight) {
            
            var points,
                closedSubpath = !!listKey.closedSubpath,
                i = 0,
                pathData = '',
                controlPoint,
                lastPoint;
            
            if (isBoxMode) {
                if (boxOrientation === "horizontal") {
                    points = [listKey.points[3], listKey.points[1]];
                } else {
                    points = [listKey.points[2], listKey.points[0]];
                }
                pathData = 'M ' + round1k(points[0].anchor.horizontal) + ' ' + round1k(points[0].anchor.vertical);
                pathData += 'L ' + round1k(points[1].anchor.horizontal) + ' ' + round1k(points[1].anchor.vertical);
            } else {
                points = listKey.points;
            
                for (; points && i < points.length; ++i) {
                    if (!i) {
                        pathData = 'M ' + round1k(points[i].anchor.horizontal) + ' ' + round1k(points[i].anchor.vertical);
                    } else {
                        lastPoint = points[i-1].forward ? points[i-1].forward : points[i-1].anchor;
                        pathData += " C " + round1k(lastPoint.horizontal) + " " + round1k(lastPoint.vertical) + " ";
                        controlPoint = points[i].backward ? points[i].backward : points[i].anchor;
                        pathData += round1k(controlPoint.horizontal) + " " + round1k(controlPoint.vertical) + " ";
                        pathData += round1k(points[i].anchor.horizontal) + " " + round1k(points[i].anchor.vertical);
                    }
                }
                if (closedSubpath) {
                    pathData += " Z";
                }
            }
            
            return pathData;
        };
        
        this.addTextOnPath = function (svgNode, layer, writer) {
            var self = this;
            return this.textComponentOrigin(layer, function (text) {
                if ((layer.text.textShape[0].char !== "onACurve" &&
                     layer.text.textShape[0].char !== "box") ||
                    !layer.text.textShape[0].path) {
                    return false;
                }

                var svgTextPathNode,
                    isBoxMode = (layer.text.textShape[0].char === "box"),
                    boxOrientation = layer.text.textShape[0].orientation,
                    dpi = (writer._root && writer._root.pxToInchRatio) ? writer._root.pxToInchRatio : 72.0,
                    maxTextSize = _boundInPx(text.textStyleRange[0].textStyle.size, dpi);

                try {
                
                svgNode.type = "text";
                svgNode.shapeBounds = layer.bounds;
                
                /*
                svgNode.textBounds = {    
                    top: layer.bounds.top + _boundInPx(layer.text.bounds.top, dpi),
                    bottom: layer.bounds.top + _boundInPx(layer.text.bounds.bottom, dpi),
                    left: layer.bounds.left + _boundInPx(layer.text.bounds.left, dpi),
                    right: layer.bounds.left + _boundInPx(layer.text.bounds.right, dpi)    
                };
                */
                
                svgNode.textBounds = {
                    top: _boundInPx(text.boundingBox.top, dpi),
                    bottom: _boundInPx(text.boundingBox.bottom, dpi),
                    left: _boundInPx(text.boundingBox.left, dpi),
                    right: _boundInPx(text.boundingBox.right, dpi)
                };
                svgNode.position = {
                    x: 0,
                    y: 0
                };
                writer.pushCurrent(svgNode);
                svgTextPathNode = writer.addSVGNode(svgNode.id + "-path", "textPath", true);
                svgTextPathNode.pathData = self._computeTextPath(layer.text.textShape[0].path.pathComponents[0].subpathListKey[0], isBoxMode, boxOrientation, svgNode.textBounds, maxTextSize);
                
                self.addTextTransform(writer, svgNode, text, layer);

                if (!self.addTextChunks(svgTextPathNode, layer, text, writer, svgNode.position, svgNode.shapeBounds)) {
                    return false;
                }

                omgStyles.addParagraphStyle(svgTextPathNode, text.paragraphStyleRange[0].paragraphStyle);

                writer.popCurrent();

                omgStyles.addTextStyle(svgNode, layer);

                omgStyles.addStylingData(svgNode, layer);
                
                } catch (exter) {
                    console.warn(exter.stack);
                    return false;
                }
                return true;
            });
        };

        
        this.addSimpleText = function (svgNode, layer, writer) {
            var self = this;
            
            return this.textComponentOrigin(layer, function (text) {                
                // FIXME: We need to differ between "paint", "path", "box" and "warp".
                // The latter two won't be supported sufficiently enough initially.
                svgNode.type = "text";
                svgNode.shapeBounds = layer.bounds;
                
                var dpi = (writer._root && writer._root.pxToInchRatio) ? writer._root.pxToInchRatio : 72.0;
                svgNode.textBounds = {
                    top: layer.bounds.top + _boundInPx(layer.text.bounds.top, dpi),
                    bottom: layer.bounds.top + _boundInPx(layer.text.bounds.bottom, dpi),
                    left: layer.bounds.left + _boundInPx(layer.text.bounds.left, dpi),
                    right: layer.bounds.left + _boundInPx(layer.text.bounds.right, dpi)
                };
                
                // It seems that textClickPoint is a quite reliable global position for
                // the initial <text> element. 
                // Values in percentage, moving to pixels so it is easier to work with te position
                svgNode.position = {
                    x: omgUtils.pct2px(text.textClickPoint.horizontal.value, writer._root.docBounds.right - writer._root.docBounds.left),
                    y: omgUtils.pct2px(text.textClickPoint.vertical.value, writer._root.docBounds.bottom - writer._root.docBounds.top),
                    unitPX: true
                };
                
                self.addTextTransform(writer, svgNode, text, layer);
                
                return self.addTextChunks(svgNode, layer, text, writer, svgNode.position, svgNode.shapeBounds);
            });
        };
        
        this.addTextChunks = function (svgNode, layer, text, writer, position, bounds) {
            var textString = text.textKey,
                svgParagraphNode,
                svgTextChunkNode,
                yEMs = 0;
            
            writer.pushCurrent(svgNode);
            
            // A paragraph is a newline added by the user. Each paragraph can
            // have a different text alignment.
            text.paragraphStyleRange.forEach(function (paragraph, iP) {
                var from,
                    to,
                    i,
                    indexTextStyleFrom,
                    indexTextStyleTo,
                    textSR = text.textStyleRange,
                    paragraphId = svgNode.id + "-" + iP,
                    spanId,
                    yPosGuess = (iP / text.paragraphStyleRange.length),
                    pctYPosGuess = Math.round(100.0 * yPosGuess),
                    svgParagraphNode,
                    currentFrom = paragraph.from,
                    xPosGuess,
                    textContent;
                
                // Text can consist of multiple textStyles. A textStyle
                // may span over multiple paragraphs and describes the text color
                // and font styling of each text span.
                textSR.forEach(function (textStyle, index) {
                    if (textStyle.from <= paragraph.from &&
                        (!isFinite(indexTextStyleFrom) || textSR[indexTextStyleFrom].from < textStyle.from)) {
                        indexTextStyleFrom = index;
                    }
                    if (textStyle.to >= paragraph.to &&
                        (!isFinite(indexTextStyleTo) || textSR[indexTextStyleTo].to > textStyle.to)) {
                        indexTextStyleTo = index;
                    }
                });
                
                if(!isFinite(indexTextStyleFrom) || !isFinite(indexTextStyleTo)) {
                    console.log('ERROR: Text style range no found for paragraph.');
                    return false;
                }
                
                if (indexTextStyleFrom !== indexTextStyleTo) {
                    
                    //then nest a paragraphNode...
                    svgParagraphNode = writer.addSVGNode(svgNode.id + "-" + i, "tspan", true);
                    svgParagraphNode.position = {
                        x: position.x,
                        y: position.y,
                        unitPX: position.unitPX,
                        unitEM: position.unitEM
                    };
                    writer.pushCurrent(svgParagraphNode);
                    pctYPosGuess = 0;
                }
                
                //process each text style, start at paragraph.from and end at paragraph.to
                //fill in any necessary text style in-between
                for (i = indexTextStyleFrom; i <= indexTextStyleTo; i++) {
                    from = (i === indexTextStyleFrom) ? paragraph.from : textSR[i].from;
                    to = (i === indexTextStyleTo) ? paragraph.to : textSR[i].to;
                    
                    textContent = textString.substring(from, to).replace("\r","");
                    if (!textContent) {
                        //represents a blank line, needs to translate to y-positioning
                        yEMs++;
                        continue;
                    }
                    spanId = (indexTextStyleTo === indexTextStyleFrom) ? paragraphId : paragraphId + "-" + (i - indexTextStyleFrom);
                    svgTextChunkNode = writer.addSVGNode(spanId, "tspan", true);
                    svgTextChunkNode.text = textContent;
                    
                    //TBD: guess X based on the position assuming characters are same width (bad assumption, but it is what we have to work with)
                    xPosGuess = currentFrom / (paragraph.to - paragraph.from);
                    
                    if (indexTextStyleFrom === indexTextStyleTo) {
                        svgTextChunkNode.position = {
                            x: 0,
                            y: yEMs,
                            unitEM: true
                        };
                        omgStyles.addParagraphStyle(svgTextChunkNode, paragraph.paragraphStyle);
                    }
                    yEMs = 1;
                    omgStyles.addTextChunkStyle(svgTextChunkNode, textSR[i]);
                }
                
                if (indexTextStyleFrom !== indexTextStyleTo) {
                    omgStyles.addParagraphStyle(svgParagraphNode, paragraph.paragraphStyle);
                    writer.popCurrent();
                }
            });
            
            omgStyles.addTextStyle(svgNode, layer);
            omgStyles.addStylingData(svgNode, layer);
            
            writer.popCurrent();
            return true;
        };

        this.addTextTransform = function (writer, svgNode, text, layer) {
            if (!text.transform && (!text.textShape || text.textShape.length === 0 || !text.textShape[0].transform)) {
                return;
            }
            var transform = text.transform || text.textShape[0].transform,
                dpi = (writer._root && writer._root.pxToInchRatio) ? writer._root.pxToInchRatio : 72.0,
                t = new Transform(),
                // The trnasformation matrix is relative to this boundaries.
                boundsOrig = layer.bounds,
                // This covers the actual bounds of the text in pt units and needs
                // to be transformed to pixel.
                boundsTransform = {
                    left:   _boundInPx(text.bounds.left, dpi),
                    right:  _boundInPx(text.bounds.right, dpi),
                    top:    _boundInPx(text.bounds.top, dpi),
                    bottom: _boundInPx(text.bounds.bottom, dpi)
                },
                obx, oby, tbx, tby;
            
            obx = (boundsOrig.right - boundsOrig.left) / 2.0;
            oby = (boundsOrig.bottom - boundsOrig.top) / 2.0;
            tbx = (boundsTransform.right - boundsTransform.left) / 2.0;
            tby = -(boundsTransform.top - boundsTransform.bottom) / 2.0;
            
            svgNode.maxTextSize = _boundInPx(text.textStyleRange[0].textStyle.size, dpi);
            
            if (transform.xx === 1 && 
                transform.xy === 0 && 
                transform.yx === 0 && 
                transform.yy === 1) {
                //its just a translate
                if (transform.tx === 0 && transform.ty === 0) {
                    //the transform does nothing, ditch it
                    return;
                }
                
                //It seems like we ought to be able to ditch the transform here
                //and move it to regular coordinates, but it SVG didn't seem to like it
                //svgNode.position.x -= (obx - tbx);
                //svgNode.position.y -= (oby - tby);
                //svgNode.unitPX = true;
            }
            
            t.translate(boundsOrig.left, boundsOrig.top);
            
            t.translate(obx, oby);
            t.multiply(transform.xx, transform.xy, transform.yx, transform.yy, transform.tx, transform.ty);
            t.translate(-obx, -oby);
            
            // Use the biggest font-size for the first line. Transform pt to px.
            t.translate(obx - tbx, (oby - tby) + svgNode.maxTextSize/2.0);
            
            svgNode.position = {
                x: 0,
                y: 0
            };
            svgNode.transform = t;
        };

        var Transform = function () {
            this.a = 1,
            this.b = 0,
            this.c = 0,
            this.d = 1,
            this.e = 0,
            this.f = 0;

            this.translate = function (tx, ty) {
                this.e += tx * this.a + ty * this.c;
                this.f += tx * this.b + ty * this.d;
            };

            this.multiply = function (a, b, c, d, e, f) {
                var t_a = this.a;
                var t_b = this.b;
                var t_c = this.c;
                var t_d = this.d;
                var t_e = this.e;
                var t_f = this.f;
                this.a = a * t_a + b * t_c;
                this.b = a * t_b + b * t_d;
                this.c = c * t_a + d * t_c;
                this.d = c * t_b + d * t_d;
                this.e = e * t_a + f * t_c + t_e;
                this.f = e * t_b + f * t_d + t_f;
            };
        };

        this.addTextData = function(svgNode, layer, writer) {
            if (this.addTextOnPath(svgNode, layer, writer) ||
                this.addSimpleText(svgNode, layer, writer)) {
                return true;
            }
            console.log("Error: No text data added for " + JSON.stringify(layer));
            return false;
        };
	}

	module.exports = new SVGOMGeneratorText();
    
}());
     
    