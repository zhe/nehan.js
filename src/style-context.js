var StyleContext = (function(){

  // to fetch first text part from content html.
  var __rex_first_letter = /(^(<[^>]+>|[\s\n])*)(\S)/mi;
  
  // these markups are not parsed, just ignored.
  var __disabled_markups = [
    "script",
    "noscript",
    "style",
    "input",
    "iframe",
    "form"
  ];

  // these properties must be under control of layout engine.
  var __managed_css_props = [
    "border-color",
    "border-radius",
    "border-style",
    "border-width",
    "box-sizing",
    "break-after",
    "break-before",
    "color",
    "display",
    "extent",
    "embeddable", // flag
    "float",
    "flow",
    "font-family",
    "font-size",
    "font-style",
    "font-weight",
    "height",
    "interactive", // flag
    "letter-spacing",
    "line-rate",
    "list-style-type",
    "list-style-position",
    "list-style-image",
    "margin",
    "measure",
    "meta", // flag
    "onload",
    "oncreate",
    "padding",
    "position",
    "section", // flag
    "section-root", // flag
    "text-align",
    "text-emphasis-style",
    "text-emphasis-position",
    "text-emphasis-color",
    "text-combine",
    "width",
    "word-break"
  ];

  var __is_managed_css_prop = function(prop){
    return List.exists(__managed_css_props, Closure.eq(prop));
  };

  var __filter_decorated_inline_elements = function(elements){
    var ret = [];
    List.iter(elements, function(element){
      if(element instanceof Box === false){
	return;
      }
      if(element.style.isTextEmphaEnable() || element.style.getMarkupName() === "ruby"){
	ret.push(element);
      } else if(element.elements){
	ret = ret.concat(__filter_decorated_inline_elements(element.elements));
      }
    });
    return ret;
  };

  /**
     @memberof Nehan
     @class StyleContext
     @classdesc abstraction of document tree hierarchy with selector values, associated markup, cursor_context.
     @constructor
     @param markup {Nehan.Tag} - markup of style
     @param paernt {Nehan.StyleContext} - parent style context
     @param args {Object} - option arguments
     @param args.forceCss {Object} - system css that must be applied.
     @param args.cursorContext {Nehan.CursorContext} - cursor context at the point of this style context created.
  */
  function StyleContext(markup, parent, args){
    this._initialize(markup, parent, args);
  }

  StyleContext.prototype = {
    _initialize : function(markup, parent, args){
      args = args || {};
      this.markup = markup;
      this.markupName = markup.getName();
      this.parent = parent || null;

      // notice that 'this.childs' is not children of each page.
      // for example, assume that <body> consists 2 page(<div1>, <div2>).
      //
      // <body><div1>page1</div1><div2>page2</div2></body>
      //
      // at this case, global chilren of <body> is <div1> and <div2>.
      // but for '<body> of page1', <div1> is the only child, and <div2> is for '<body> of page2' also.
      // so we may create 'contextChilds' to distinguish these difference.
      this.childs = [];

      this.next = null; // next sibling
      this.prev = null; // prev sibling

      // initialize tree
      if(parent){
	parent.appendChild(this);
      }

      // create context for each functional css property.
      this.selectorPropContext = new SelectorPropContext(this, args.cursorContext || null);

      // create selector callback context,
      // this context is passed to "onload" callback.
      // unlike selector-context, this context has reference to all css values associated with this style.
      // because 'onload' callback is called after loading selector css.
      // notice that at this phase, css values are not converted into internal style object.
      // so by updating css value, you can update calculation of internal style object.
      this.selectorContext = new SelectorContext(this, args.cursorContext || null);

      this.managedCss = new CssHashSet();
      this.unmanagedCss = new CssHashSet();

      // load managed css from
      // 1. load selector css.
      // 2. load inline css from 'style' property of markup.
      // 3. load dynamic callback css(onload) from selector css.
      // 4. load system required css(args.forceCss).
      this.managedCss.addValues(this._loadSelectorCss(markup, parent));
      this.managedCss.addValues(this._loadInlineCss(markup));
      this.managedCss.addValues(this._loadCallbackCss(this.managedCss, "onload"));
      this.managedCss.addValues(args.forceCss, {});

      // load unmanaged css from managed css
      this.unmanagedCss.addValues(this._loadUnmanagedCss(this.managedCss));

      // always required properties
      this.display = this._loadDisplay(); // required
      this.flow = this._loadFlow(); // required
      this.boxSizing = this._loadBoxSizing(); // required

      // optional properties
      var color = this._loadColor();
      if(color){
	this.color = color;
      }
      var font = this._loadFont();
      if(font){
	this.font = font;
      }
      var position = this._loadPosition();
      if(position){
	this.position = position;
      }
      var edge = this._loadEdge(this.flow, this.getFontSize());
      if(edge){
	this.edge = edge;
      }
      var line_rate = this._loadLineRate();
      if(line_rate){
	this.lineRate = line_rate;
      }
      var text_align = this._loadTextAlign();
      if(text_align){
	this.textAlign = text_align;
      }
      var text_empha = this._loadTextEmpha();
      if(text_empha){
	this.textEmpha = text_empha;
      }
      var text_combine = this._loadTextCombine();
      if(text_combine){
	this.textCombine = text_combine;
      }
      var list_style = this._loadListStyle();
      if(list_style){
	this.listStyle = list_style;
      }
      // keyword 'float' is reserved in js, so we name this prop 'float direction' instead.
      var float_direction = this._loadFloatDirection();
      if(float_direction){
	this.floatDirection = float_direction;
      }
      var break_before = this._loadBreakBefore();
      if(break_before){
	this.breakBefore = break_before;
      }
      var break_after = this._loadBreakAfter();
      if(break_after){
	this.breakAfter = break_after;
      }
      var word_break = this._loadWordBreak();
      if(word_break){
	this.wordBreak = word_break;
      }
      // static size is defined in selector or tag attr, hightest priority
      this.staticMeasure = this._loadStaticMeasure();
      this.staticExtent = this._loadStaticExtent();

      // context size(outer size and content size) is defined by
      // 1. current static size
      // 2. parent size
      // 3. current edge size.
      this.initContextSize(this.staticMeasure, this.staticExtent);

      // load partition set after context size is calculated.
      if(this.display === "table" && this.getCssAttr("table-layout") === "auto"){
	this.tablePartition = TablePartitionParser.parse(this, new TokenStream(this.getContent()));
      }

      // disable some unmanaged css properties depending on loaded style values.
      this._disableUnmanagedCssProps(this.unmanagedCss);
    },
    /**
       @memberof Nehan.StyleContext
       @return {Nehan.OutlinContext}
    */
    getOutlineContext : function(){
      return this.outlineContext || this.parent.getOutlineContext();
    },
    /**
       called when section root(body, blockquote, fieldset, figure, td) starts.

       @memberof Nehan.StyleContext
    */
    startOutlineContext : function(){
      this.outlineContext = new OutlineContext(this.getMarkupName());
    },
    /**
       called when section root(body, blockquote, fieldset, figure, td) ends.

       @memberof Nehan.StyleContext
       @method endOutlineContext
    */
    endOutlineContext : function(){
      DocumentContext.addOutlineContext(this.getOutlineContext());
    },
    /**
       called when section content(article, aside, nav, section) starts.

       @memberof Nehan.StyleContext
       @method startSectionContext
    */
    startSectionContext : function(){
      this.getOutlineContext().startSection(this.getMarkupName());
    },
    /**
       called when section content(article, aside, nav, section) ends.

       @memberof Nehan.StyleContext
       @method startSectionContext
    */
    endSectionContext : function(){
      this.getOutlineContext().endSection(this.getMarkupName());
    },
    /**
       called when heading content(h1-h6) starts.

       @memberof Nehan.StyleContext
       @method startHeaderContext
       @return {string} header id
    */
    startHeaderContext : function(opt){
      return this.getOutlineContext().addHeader({
	type:opt.type,
	rank:opt.rank,
	title:opt.title
      });
    },
    /**
       calculate contexual box size of this style.

       @memberof Nehan.StyleContext
       @method initContextSize
       @param measure {int}
       @param extent {int}
       @description <pre>
       * [context_size] = (outer_size, content_size)

       * (a) outer_size
       * 1. if direct size is given, use it as outer_size.
       * 2. else if parent exists, use content_size of parent.
       * 3. else if parent not exists(root), use layout size defined in layout.js.
      
       * (b) content_size
       * 1. if edge(margin/padding/border) is defined, content_size = [outer_size] - [edge_size]
       * 2. else(no edge),  content_size = [outer_size]
       *</pre>
    */
    initContextSize : function(measure, extent){
      this.outerMeasure = measure  || (this.parent? this.parent.contentMeasure : Display.getMeasure(this.flow));
      this.outerExtent = extent || (this.parent? this.parent.contentExtent : Display.getExtent(this.flow));
      this.contentMeasure = this._computeContentMeasure(this.outerMeasure);
      this.contentExtent = this._computeContentExtent(this.outerExtent);
    },
    /**
     update context size, but static size is preferred, called from {@link Nehan.FlipGenerator}.

     @memberof Nehan.StyleContext
     @method updateContextSize
     @param measure {int}
     @param extent {int}
    */
    updateContextSize : function(measure, extent){
      this.forceUpdateContextSize(this.staticMeasure || measure, this.staticExtent || extent);
    },
    /**
       force update context size, called from generator of floating-rest-generator.

       @memberof Nehan.StyleContext
       @param measure {int}
       @param extent {int}
    */
    forceUpdateContextSize : function(measure, extent){
      this.initContextSize(measure, extent);

      // force re-culculate context-size of children based on new context-size of parent.
      List.iter(this.childs, function(child){
	child.forceUpdateContextSize(null, null);
      });
    },
    /**
       clone style-context with temporary css

       @memberof Nehan.StyleContext
       @param css {Object}
       @return {Nehan.StyleContext}
    */
    clone : function(css){
      // no one can clone root style.
      if(this.parent === null){
	return this.createChild("div", css);
      }
      var clone_style = new StyleContext(this.markup, this.parent, {forceCss:(css || {})});
      clone_style.parent.removeChild(clone_style);
      clone_style.setClone(true);
      return clone_style;
    },
    /**
       append child style context

       @memberof Nehan.StyleContext
       @param child_style {Nehan.StyleContext}
    */
    appendChild : function(child_style){
      if(this.childs.length > 0){
	var last_child = List.last(this.childs);
	last_child.next = child_style;
	child_style.prev = last_child;
      }
      this.childs.push(child_style);
    },
    /**
       @memberof Nehan.StyleContext
       @param child_style {Nehan.StyleContext}
       @return {Nehan.StyleContext | null} removed child or null if nothing removed.
    */
    removeChild : function(child_style){
      var index = List.indexOf(this.childs, function(child){
	return child === child_style;
      });
      if(index >= 0){
	var removed_child = this.childs.splice(index, 1);
	return removed_child;
      }
      return null;
    },
    /**
       inherit style with tag_name and css(optional).

       @memberof Nehan.StyleContext
       @param tag_name {String}
       @param css {Object}
       @param tag_attr {Object}
       @return {Nehan.StyleContext}
    */
    createChild : function(tag_name, css, tag_attr){
      var tag = new Tag("<" + tag_name + ">");
      tag.setAttrs(tag_attr || {});
      return new StyleContext(tag, this, {forceCss:(css || {})});
    },
    /**
       calclate max marker size by total child_count(item_count).

       @memberof Nehan.StyleContext
       @param item_count {int}
    */
    setListItemCount : function(item_count){
      var max_marker_html = this.getListMarkerHtml(item_count);
      // create temporary inilne-generator but using clone style, this is because sometimes marker html includes "<span>" element,
      // and we have to avoid 'appendChild' from child-generator of this tmp generator.
      var tmp_gen = new InlineGenerator(this.clone(), new TokenStream(max_marker_html));
      var line = tmp_gen.yield();
      var marker_measure = line? line.inlineMeasure + Math.floor(this.getFontSize() / 2) : this.getFontSize();
      var marker_extent = line? line.size.getExtent(this.flow) : this.getFontSize();
      this.listMarkerSize = this.flow.getBoxSize(marker_measure, marker_extent);
    },
    /**
       @memberof Nehan.StyleContext
       @return {boolean}
    */
    isClone : function(){
      return this._isClone || false;
    },
    /**
       @memberof Nehan.StyleContext
       @param state {boolean}
    */
    setClone : function(state){
      this._isClone = state;
    },
    /**
       @memberof Nehan.StyleContext
       @param opt {Object}
       @param opt.extent {int}
       @param opt.elements {Array.<Nehan.Box>}
       @param opt.breakAfter {boolean}
       @param opt.blockId {int}
       @param opt.rootBlockId {int}
       @param opt.content {String}
       @param opt.cancelEdge {Object}
       @param opt.cancelEdge.before {int}
       @param opt.cancelEdge.after {int}
       @return {Nehan.Box}
    */
    createBlock : function(opt){
      opt = opt || {};
      var elements = opt.elements || [];
      var measure = this.contentMeasure;
      var extent = (this.parent && opt.extent && this.staticExtent === null)? opt.extent : this.contentExtent;
      var classes = ["nehan-block", "nehan-" + this.getMarkupName()].concat(this.markup.getClasses());
      var box_size = this.flow.getBoxSize(measure, extent);
      var box = new Box(box_size, this);
      if(this.markup.isHeaderTag()){
	classes.push("nehan-header");
      }
      if(this.isClone()){
	classes.push("nehan-clone");
      }
      if(typeof opt.rootBlockId !== "undefined"){
	box.rootBlockId = opt.rootBlockId;
      }
      box.blockId = opt.blockId;
      box.display = (this.display === "inline-block")? this.display : "block";
      box.edge = this._createBlockContextEdge(this.edge || null, opt.cancelEdge || null); // for Box::getLayoutExtent, Box::getLayoutMeasure
      box.elements = elements;
      box.classes = classes;
      box.charCount = List.fold(elements, 0, function(total, element){
	return total + (element? (element.charCount || 0) : 0);
      });
      box.breakAfter = this.isBreakAfter() || opt.breakAfter || false;
      box.content = opt.content || null;
      if(this.isPushed()){
	box.pushed = true;
      } else if(this.isPulled()){
	box.pulled = true;
      }
      return box;
    },
    _createBlockContextEdge : function(edge, cancel_edge){
      if(edge === null){
	return null;
      }
      if(cancel_edge === null || (cancel_edge.before === 0 && cancel_edge.after === 0)){
	return edge; // nothing to do
      }
      var context_edge = edge.clone();
      if(cancel_edge.before){
	context_edge.clearBefore(this.flow);
      }
      if(cancel_edge.after){
	context_edge.clearAfter(this.flow);
      }
      return context_edge;
    },
    /**
       @memberof Nehan.StyleContext
       @param opt
       @param opt.breakAfter {boolean}
       @return {Nehan.Box}
    */
    createImage : function(opt){
      opt = opt || {};
      // image size always considered as horizontal mode.
      var width = this.getMarkupAttr("width")? parseInt(this.getMarkupAttr("width"), 10) : (this.staticMeasure || this.font.size);
      var height = this.getMarkupAttr("height")? parseInt(this.getMarkupAttr("height"), 10) : (this.staticExtent || this.font.size);
      var classes = ["nehan-block", "nehan-image"].concat(this.markup.getClasses());
      var image_size = new BoxSize(width, height);
      var image = new Box(image_size, this);
      image.display = this.display; // inline, block, inline-block
      image.edge = this.edge || null;
      image.classes = classes;
      image.charCount = 0;
      if(this.isPushed()){
	image.pushed = true;
      } else if(this.isPulled()){
	image.pulled = true;
      }
      image.breakAfter = this.isBreakAfter() || opt.breakAfter || false;
      return image;
    },
    /**
       @memberof Nehan.StyleContext
       @param opt
       @param opt.measure {int}
       @param opt.content {String}
       @param opt.charCount {int}
       @param opt.elements {Array.<Nehan.Char | Nehan.Word | Nehan.Tcy>}
       @param opt.texts {Array.<Nehan.Char | Nehan.Word | Nehan.Tcy>}
       @param opt.maxFontSize {int}
       @param opt.maxExtent {int}
       @param opt.lineBreak {boolean}
       @param opt.breakAfter {boolean}
       @return {Nehan.Box}
    */
    createLine : function(opt){
      opt = opt || {};
      var elements = opt.elements || [];
      var max_font_size = opt.maxFontSize || this.getFontSize();
      var max_extent = opt.maxExtent || 0;
      if(this.isTextEmphaEnable()){
	max_extent = Math.max(max_extent, this.getEmphaLineExtent());
      } else if(this.markup.name === "ruby"){
	max_extent = Math.max(max_extent, this.getRubyLineExtent());
      } else {
	max_extent = Math.max(max_extent, this.getAutoLineExtent());
      }
      var measure = (this.parent && opt.measure && this.staticMeasure === null && !this.isRootLine())? opt.measure : this.contentMeasure;
      if(this.display === "inline-block"){
	measure = this.staticMeasure || opt.measure;
      }
      var line_size = this.flow.getBoxSize(measure, max_extent);
      var classes = ["nehan-inline", "nehan-inline-" + this.flow.getName()].concat(this.markup.getClasses());
      var line = new Box(line_size, this);
      line.display = "inline"; // caution: display of anonymous line shares it's parent markup.
      line.elements = opt.elements || [];
      line.classes = this.isRootLine()? classes : classes.concat("nehan-" + this.getMarkupName());
      line.charCount = opt.charCount || 0;
      line.maxFontSize = max_font_size;
      line.maxExtent = max_extent;
      line.content = opt.content || null;

      // edge of top level line is disabled.
      // for example, consider '<p>aaa<span>bbb</span>ccc</p>'.
      // anonymous line block('aaa' and 'ccc') is already edged by <p> in block level.
      // so if line is anonymous, edge must be ignored.
      line.edge = (this.edge && !this.isRootLine())? this.edge : null;

      // backup other line data. mainly required to restore inline-context.
      if(this.isRootLine()){
	line.lineBreak = opt.lineBreak || false;
	line.breakAfter = opt.breakAfter || false;
	line.inlineMeasure = opt.measure || this.contentMeasure;
	line.texts = opt.texts || [];

	// if vertical line, needs some position fix for decorated element(ruby, empha) to align baseline.
	if(this.isTextVertical()){
	  this._setVertBaseline(elements, max_font_size, max_extent);
	}
	if(this.textAlign && !this.textAlign.isStart()){
	  this._setTextAlign(line, this.textAlign);
	}
      }
      return line;
    },
    /**
       @memberof Nehan.StyleContext
       @return {Nehan.Box}
    */
    createBreakLine : function(){
      var line = new Box(this.flow.getBoxSize(this.contentMeasure, 0), this);
      line.breakAfter = true;
      line.elements = [];
      return line;
    },
    /**
       @memberof Nehan.StyleContext
       @return {boolean}
    */
    isDisabled : function(){
      if(this.display === "none"){
	return true;
      }
      if(List.exists(__disabled_markups, Closure.eq(this.getMarkupName()))){
	return true;
      }
      if(this.contentMeasure <= 0 || this.contentExtent <= 0){
	return true;
      }
      if(this.markup.isCloseTag()){
	return true;
      }
      if(!this.markup.isSingleTag() && this.isBlock() && this.isMarkupEmpty() && this.getContent() === ""){
	return true;
      }
      return false;
    },
    /**
       @memberof Nehan.StyleContext
       @return {boolean}
    */
    isBlock : function(){
      switch(this.display){
      case "block":
      case "table":
      case "table-caption":
      case "table-header-group": // <thead>
      case "table-row-group": // <tbody>
      case "table-footer-group": // <tfoot>
      case "table-row":
      case "table-cell":
      case "list-item":
	return true;
      }
      return false;
    },
    /**
       @memberof Nehan.StyleContext
       @return {boolean}
    */
    isRoot : function(){
      return this.parent === null;
    },
    /**
       @memberof Nehan.StyleContext
       @return {boolean}
    */
    isChildBlock : function(){
      return this.isBlock() && !this.isRoot();
    },
    /**
       @memberof Nehan.StyleContext
       @return {boolean}
    */
    isInlineBlock : function(){
      return this.display === "inline-block";
    },
    /**
       @memberof Nehan.StyleContext
       @return {boolean}
    */
    isInline : function(){
      return this.display === "inline";
    },
    /**
       @memberof Nehan.StyleContext
       @return {boolean}
    */
    isRootLine : function(){
      // check if current inline is anonymous line block.
      // 1. line-object is just under the block element.
      //  <body>this text is included in anonymous line block</body>
      //
      // 2. line-object is just under the inline-block element.
      //  <div style='display:inline-block'>this text is included in anonymous line block</div>
      return this.isBlock() || this.isInlineBlock();
    },
    /**
       @memberof Nehan.StyleContext
       @return {boolean}
    */
    isFloatStart : function(){
      return this.floatDirection && this.floatDirection.isStart();
    },
    /**
       @memberof Nehan.StyleContext
       @return {boolean}
    */
    isFloatEnd : function(){
      return this.floatDirection && this.floatDirection.isEnd();
    },
    /**
       @memberof Nehan.StyleContext
       @return {boolean}
    */
    isFloated : function(){
      return this.isFloatStart() || this.isFloatEnd();
    },
    /**
       @memberof Nehan.StyleContext
       @return {boolean}
    */
    isParallel : function(){
      return this.display === "list-item";
    },
    /**
       @memberof Nehan.StyleContext
       @return {boolean}
    */
    isPushed : function(){
      return this.getMarkupAttr("pushed") !== null;
    },
    /**
       @memberof Nehan.StyleContext
       @return {boolean}
    */
    isPulled : function(){
      return this.getMarkupAttr("pulled") !== null;
    },
    /**
       @memberof Nehan.StyleContext
       @return {boolean}
    */
    isPasted : function(){
      return this.getMarkupAttr("pasted") !== null;
    },
    /**
       @memberof Nehan.StyleContext
       @return {boolean}
    */
    isTextEmphaEnable : function(){
      return (this.textEmpha && this.textEmpha.isEnable())? true : false;
    },
    /**
       @memberof Nehan.StyleContext
       @return {boolean}
    */
    isTextVertical : function(){
      return this.flow.isTextVertical();
    },
    /**
       @memberof Nehan.StyleContext
       @return {boolean}
    */
    isTextHorizontal : function(){
      return this.flow.isTextHorizontal();
    },
    /**
       @memberof Nehan.StyleContext
       @return {boolean}
    */
    isPositionAbsolute : function(){
      return this.position.isAbsolute();
    },
    /**
       @memberof Nehan.StyleContext
       @return {boolean}
    */
    isPre : function(){
      var white_space = this.getCssAttr("white-space", "normal");
      return white_space === "pre";
    },
    /**
       @memberof Nehan.StyleContext
       @return {boolean}
    */
    isPageBreak : function(){
      switch(this.getMarkupName()){
      case "page-break": case "end-page": case "pbr":
	return true;
      default:
	return false;
      }
    },
    /**
       @memberof Nehan.StyleContext
       @return {boolean}
    */
    isBreakBefore : function(){
      return this.breakBefore? !this.breakBefore.isAvoid() : false;
    },
    /**
       @memberof Nehan.StyleContext
       @return {boolean}
    */
    isBreakAfter : function(){
      return this.breakAfter? !this.breakAfter.isAvoid() : false;
    },
    /**
       @memberof Nehan.StyleContext
       @return {boolean}
    */
    isFirstChild : function(){
      var childs = this.getParentChilds();
      return (childs.length > 0 && childs[0] === this);
    },
    /**
       @memberof Nehan.StyleContext
       @return {boolean}
    */
    isFirstOfType : function(){
      var childs = this.getParentChildsOfType(this.getMarkupName());
      return (childs.length > 0 && childs[0] === this);
    },
    /**
       @memberof Nehan.StyleContext
       @return {boolean}
    */
    isLastChild : function(){
      // for descent parsing, last child can't be gained,
      // this pseudo-class is maybe enabled in future release.

      //return List.last(this.getParentChilds()) === this;
      return false; // TODO
    },
    /**
       @memberof Nehan.StyleContext
       @return {boolean}
    */
    isLastOfType : function(){
      //return List.last(this.getParentChildsOfType(this.getMarkupName())) === this;
      return false; // TODO
    },
    /**
       @memberof Nehan.StyleContext
       @return {boolean}
    */
    isOnlyChild : function(){
      var childs = this.getParentChilds();
      return (childs.length === 1 && childs[0] === this);
    },
    /**
       @memberof Nehan.StyleContext
       @return {boolean}
    */
    isOnlyOfType : function(){
      var childs = this.getParentChildsOfType(this.getMarkupName());
      return (childs.length === 1 && childs[0] === this);
    },
    /**
       @memberof Nehan.StyleContext
       @return {boolean}
    */
    isMarkupEmpty : function(){
      return this.markup.isEmpty();
    },
    /**
       @memberof Nehan.StyleContext
       @return {boolean}
    */
    isWordBreakAll : function(){
      return this.wordBreak && this.wordBreak === "break-all";
    },
    /**
       @memberof Nehan.StyleContext
       @return {boolean}
    */
    hasFlipFlow : function(){
      return this.parent? (this.flow !== this.parent.flow) : false;
    },
    /**
       @memberof Nehan.StyleContext
    */
    clearBreakBefore : function(){
      this.breakBefore = null;
    },
    /**
       @memberof Nehan.StyleContext
    */
    clearBreakAfter : function(){
      this.breakAfter = null;
    },
    /**
       search property from markup attributes first, and css values second.

       @memberof Nehan.StyleContext
       @param name {String}
       @param def_value {default_value}
       @return {value}
    */
    getAttr : function(name, def_value){
      var ret = this.getMarkupAttr(name);
      if(typeof ret !== "undefined" && ret !== null){
	return ret;
      }
      ret = this.getCssAttr(name);
      if(typeof ret !== "undefined" && ret !== null){
	return ret;
      }
      return (typeof def_value !== "undefined")? def_value : null;
    },
    /**
       @memberof Nehan.StyleContext
       @param name {String}
       @param def_value {default_value}
       @return {value}
    */
    getMarkupAttr : function(name, def_value){
      // if markup is "<img src='aaa.jpg'>"
      // getMarkupAttr("src") => 'aaa.jpg'
      if(name === "id"){
	return this.markup.id;
      }
      return this.markup.getAttr(name, def_value);
    },
    _evalCssAttr : function(name, value){
      // "oncreate" not return style, it's a hook called after this style is converted into dom element.
      // so leave it as it is.
      if(name === "oncreate"){
	return value;
      }
      // if value is function, call with selector context, and format the returned value.
      if(typeof value === "function"){
	return CssParser.formatValue(name, value(this.selectorPropContext));
      }
      return value; // already formatted
    },
    /**
       @memberof Nehan.StyleContext
       @param name {String}
       @param value {css_value}
    */
    setCssAttr : function(name, value){
      if(__is_managed_css_prop(name)){
	this.managedCss.add(name, value);
      } else {
	this.unmanagedCss.add(name, value);
      }
    },
    /**
       @memberof Nehan.StyleContext
       @param name {String}
       @def_value {default_value}
       @return {css_value}
       @description <pre>
       * notice that subdivided properties like 'margin-before' as [name] are always not found,
       * even if you defined them in setStyle(s).
       * because all subdivided properties are already converted into unified name in loading process.
    */
    getCssAttr : function(name, def_value){
      var ret;
      ret = this.managedCss.get(name);
      if(ret !== null){
	return this._evalCssAttr(name, ret);
      }
      ret = this.unmanagedCss.get(name);
      if(ret !== null){
	return this._evalCssAttr(name, ret);
      }
      return (typeof def_value !== "undefined")? def_value : null;
    },
    /**
       @memberof Nehan.StyleContext
       @return {String}
    */
    getParentMarkupName : function(){
      return this.parent? this.parent.getMarkupName() : null;
    },
    /**
       @memberof Nehan.StyleContext
       @return {String}
    */
    getMarkupName : function(){
      return this.markup.getName();
    },
    /**
       @memberof Nehan.StyleContext
       @return {String}
    */
    getMarkupId : function(){
      // if markup is <p id="foo">, markup.id is "nehan-foo".
      return this.markup.getId();
    },
    /**
       @memberof Nehan.StyleContext
       @return {Array.<String>}
    */
    getMarkupClasses : function(){
      return this.markup.getClasses();
    },
    /**
       @memberof Nehan.StyleContext
       @return {String}
    */
    getMarkupContent : function(){
      return this.markup.getContent();
    },
    /**
       @memberof Nehan.StyleContext
       @return {int}
    */
    getMarkupPos : function(){
      return this.markup.pos;
    },
    /**
       @memberof Nehan.StyleContext
       @return {String}
    */
    getMarkupData : function(name){
      return this.markup.getData(name);
    },
    /**
       @memberof Nehan.StyleContext
       @return {String}
    */
    getContent : function(){
      var content = this.markup.getContent();
      var before = Selectors.getValuePe(this, "before");
      if(!Obj.isEmpty(before)){
	content = Html.tagWrap("before", before.content || "") + content;
      }
      var after = Selectors.getValuePe(this, "after");
      if(!Obj.isEmpty(after)){
	content = content + Html.tagWrap("after", after.content || "");
      }
      var first_letter = Selectors.getValuePe(this, "first-letter");
      if(!Obj.isEmpty(first_letter)){
	content = content.replace(__rex_first_letter, function(match, p1, p2, p3){
	  return p1 + Html.tagWrap("first-letter", p3);
	});
      }
      var first_line = Selectors.getValuePe(this, "first-line");
      if(!Obj.isEmpty(first_line)){
	content = Html.tagWrap("first-line", content);
      }
      return content;
    },
    /**
       @memberof Nehan.StyleContext
       @return {int}
    */
    getHeaderRank : function(){
      return this.markup.getHeaderRank();
    },
    /**
       @memberof Nehan.StyleContext
       @return {int}
    */
    getFontSize : function(){
      return this.font.size;
    },
    /**
       @memberof Nehan.StyleContext
       @return {String}
    */
    getFontFamily : function(){
      return this.font.family || Display.fontFamily;
    },
    /**
       @memberof Nehan.StyleContext
       @return {Nehan.TextAlign}
    */
    getTextAlign : function(){
      return this.textAlign || TextAligns.get("start");
    },
    /**
       @memberof Nehan.StyleContext
       @return {String}
    */
    getTextCombine : function(){
      return this.textCombine || null;
    },
    /**
       @memberof Nehan.StyleContext
       @return {int}
    */
    getLetterSpacing : function(){
      return this.letterSpacing || 0;
    },
    /**
       @memberof Nehan.StyleContext
       @param order {int}
       @return {String}
    */
    getListMarkerHtml : function(order){
      return this.listStyle? this.listStyle.getMarkerHtml(order) : (this.parent? this.parent.getListMarkerHtml(order) : "");
    },
    /**
       @memberof Nehan.StyleContext
       @return {int}
    */
    getListMarkerSize : function(){
      return this.listMarkerSize? this.listMarkerSize : (this.parent? this.parent.getListMarkerSize() : this.getFontSize());
    },
    /**
       @memberof Nehan.StyleContext
       @return {Nehan.Color}
    */
    getColor : function(){
      return this.color || (this.parent? this.parent.getColor() : new Color(Display.fontColor));
    },
    /**
       @memberof Nehan.StyleContext
       @return {Nehan.Partition}
    */
    getTablePartition : function(){
      return this.tablePartition || (this.parent? this.parent.getTablePartition() : null);
    },
    /**
       @memberof Nehan.StyleContext
       @return {int}
    */
    getChildCount : function(){
      return this.childs.length;
    },
    /**
       @memberof Nehan.StyleContext
       @return {int}
    */
    getChildIndex : function(){
      var self = this;
      return List.indexOf(this.getParentChilds(), function(child){
	return child === self;
      });
    },
    /**
       @memberof Nehan.StyleContext
       @return {int}
    */
    getChildIndexOfType : function(){
      var self = this;
      return List.indexOf(this.getParentChildsOfType(this.getMarkupName()), function(child){
	return child === self;
      });
    },
    /**
       @memberof Nehan.StyleContext
       @return {Nehan.StyleContext}
    */
    getNthChild : function(nth){
      return this.childs[nth] || null;
    },
    /**
       @memberof Nehan.StyleContext
       @return {Array.<Nehan.StyleContext>}
    */
    getParentChilds : function(){
      return this.parent? this.parent.childs : [];
    },
    /**
       @memberof Nehan.StyleContext
       @param nth {int}
       @return {Nehan.StyleContext}
    */
    getParentNthChild : function(nth){
      return this.parent? this.parent.getNthChild(nth) : null;
    },
    /**
       @memberof Nehan.StyleContext
       @param markup_name {String}
       @return {Nehan.StyleContext}
    */
    getParentChildsOfType : function(markup_name){
      return List.filter(this.getParentChilds(), function(child){
	return child.getMarkupName() === markup_name;
      });
    },
    /**
       @memberof Nehan.StyleContext
       @return {Nehan.BoxFlow}
    */
    getParentFlow : function(){
      return this.parent? this.parent.flow : this.flow;
    },
    /**
       @memberof Nehan.StyleContext
       @return {int}
    */
    getParentFontSize : function(){
      return this.parent? this.parent.getFontSize() : Display.fontSize;
    },
    /**
       @memberof Nehan.StyleContext
       @return {int}
    */
    getParentContentMeasure : function(){
      return this.parent? this.parent.contentMeasure : Display.getMeasure(this.flow);
    },
    /**
       @memberof Nehan.StyleContext
       @return {int}
    */
    getParentContentExtent : function(){
      return this.parent? this.parent.contentExtent : Display.getExtent(this.flow);
    },
    /**
       @memberof Nehan.StyleContext
       @return {Nehan.StyleContext}
    */
    getNextSibling : function(){
      return this.next;
    },
    /**
       @memberof Nehan.StyleContext
       @return {float | int}
    */
    getLineRate : function(){
      return this.lineRate || Display.lineRate || 2;
    },
    /**
       @memberof Nehan.StyleContext
       @return {int}
    */
    getEmphaLineExtent : function(){
      return this.getFontSize() * 3;
    },
    /**
       @memberof Nehan.StyleContext
       @return {int}
    */
    getRubyLineExtent : function(){
      var base_font_size = this.getFontSize();
      var base_extent = Math.floor(base_font_size * this.getLineRate());
      var rt_extent = Display.getRtFontSize(base_font_size);
      return base_extent + rt_extent;
    },
    /**
       @memberof Nehan.StyleContext
       @return {int}
    */
    getAutoLineExtent : function(){
      return Math.floor(this.getFontSize() * this.getLineRate());
    },
    /**
       @memberof Nehan.StyleContext
       @return {int}
    */
    getEdgeMeasure : function(flow){
      var edge = this.edge || null;
      return edge? edge.getMeasure(flow || this.flow) : 0;
    },
    /**
       @memberof Nehan.StyleContext
       @return {int}
    */
    getEdgeExtent : function(flow){
      var edge = this.edge || null;
      return edge? edge.getExtent(flow || this.flow) : 0;
    },
    /**
       @memberof Nehan.StyleContext
       @return {Object} {before:xxx, after:yyy}
    */
    getBlockContextEdge : function(flow){
      flow = flow || this.flow;
      var edge = this.edge || null;
      return {
	before:(edge? edge.getBefore(flow) : 0),
	after:(edge? edge.getAfter(flow) : 0)
      };
    },
    /**
       @memberof Nehan.StyleContext
       @return {int}
    */
    getInnerEdgeMeasure : function(flow){
      var edge = this.edge || null;
      return edge? edge.getInnerMeasureSize(flow || this.flow) : 0;
    },
    /**
       @memberof Nehan.StyleContext
       @return {int}
    */
    getInnerEdgeExtent : function(flow){
      var edge = this.edge || null;
      return edge? edge.getInnerExtentSize(flow || this.flow) : 0;
    },
    /**
       @memberof Nehan.StyleContext
       @return {Object}
    */
    getCssBlock : function(){
      // notice that box-size, box-edge is box local variable,<br>
      // so style of box-size(content-size) and edge-size are generated at Box::getCssBlock
      var css = {};
      css.display = "block";
      if(this.font){
	Args.copy(css, this.font.getCss());
      }
      if(this.parent){
	Args.copy(css, this.parent.flow.getCss());
      }
      if(this.color){
	Args.copy(css, this.color.getCss());
      }
      if(this.letterSpacing && !this.isTextVertical()){
	css["letter-spacing"] = this.letterSpacing + "px";
      }
      if(this.floatDirection){
	Args.copy(css, this.floatDirection.getCss(this.flow));
      }
      if(this.position){
	Args.copy(css, this.position.getCss());
      }
      if(this.zIndex){
	css["z-index"] = this.zIndex;
      }
      this.unmanagedCss.copyValuesTo(css);
      //css.overflow = "hidden"; // to avoid margin collapsing
      return css;
    },
    /**
       @memberof Nehan.StyleContext
       @return {Object}
    */
    getCssInline : function(){
      // notice that line-size, line-edge is box local variable,
      // so style of line-size(content-size) and edge-size are generated at Box::getCssInline
      var css = {};
      if(this.font){
	Args.copy(css, this.font.getCss());
      }
      if(this.color){
	Args.copy(css, this.color.getCss());
      }
      // anonymous line block need to follow parent blockflow.
      if(this.isRootLine()){
	Args.copy(css, this.flow.getCss());
      }
      if(this.isTextVertical()){
	css["line-height"] = "1em";
	if(Nehan.Env.client.isAppleMobileFamily()){
	  css["letter-spacing"] = "-0.001em";
	}
	if(this.markup.getName() !== "ruby"){
	  css["margin-left"] = css["margin-right"] = "auto";
	  css["text-align"] = "center";
	}
      } else {
	// if line-height is defined, enable only when horizontal mode.
	// this logic is required for drop-caps of horizontal mode.
	// TODO: more simple solution.
	var line_height = this.getCssAttr("line-height");
	if(line_height){
	  css["line-height"] = this._computeUnitSize(line_height, this.font.size) + "px";
	}
      }
      this.unmanagedCss.copyValuesTo(css);
      return css;
    },
    _computeContentMeasure : function(outer_measure){
      switch(this.boxSizing){
      case "margin-box": return outer_measure - this.getEdgeMeasure();
      case "border-box": return outer_measure - this.getInnerEdgeMeasure();
      case "content-box": return outer_measure;
      default: return outer_measure;
      }
    },
    _computeContentExtent : function(outer_extent){
      switch(this.boxSizing){
      case "margin-box": return outer_extent - this.getEdgeExtent();
      case "border-box": return outer_extent - this.getInnerEdgeExtent();
      case "content-box": return outer_extent;
      default: return outer_extent;
      }
    },
    _computeFontSize : function(val, unit_size){
      var str = String(val).replace(/\/.+$/, ""); // remove line-height value like 'large/150%"'
      var size = Display.fontSizeNames[str] || str;
      var max_size = this.getParentFontSize();
      var font_size = this._computeUnitSize(size, unit_size, max_size);
      return Math.min(font_size, Display.maxFontSize);
    },
    _computeUnitSize : function(val, unit_size, max_size){
      var str = String(val);
      if(str.indexOf("rem") > 0){
	var rem_scale = parseFloat(str.replace("rem",""));
	return Math.round(Display.fontSize * rem_scale); // use root font-size
      }
      if(str.indexOf("em") > 0){
	var em_scale = parseFloat(str.replace("em",""));
	return Math.round(unit_size * em_scale);
      }
      if(str.indexOf("pt") > 0){
	return Math.round(parseInt(str, 10) * 4 / 3);
      }
      if(str.indexOf("%") > 0){
	return Math.round(max_size * parseInt(str, 10) / 100);
      }
      var px = parseInt(str, 10);
      return isNaN(px)? 0 : px;
    },
    _computeCornerSize : function(val, unit_size){
      var ret = {};
      for(var prop in val){
	ret[prop] = [0, 0];
	ret[prop][0] = this._computeUnitSize(val[prop][0], unit_size);
	ret[prop][1] = this._computeUnitSize(val[prop][1], unit_size);
      }
      return ret;
    },
    _computeEdgeSize : function(val, unit_size){
      var ret = {};
      for(var prop in val){
	ret[prop] = this._computeUnitSize(val[prop], unit_size);
      }
      return ret;
    },
    _setTextAlign : function(line, text_align){
      var content_measure  = line.getContentMeasure(this.flow);
      var space_measure = content_measure - line.inlineMeasure;
      if(space_measure <= 0){
	return;
      }
      var padding = new Padding();
      if(text_align.isCenter()){
	var start_offset = Math.floor(space_measure / 2);
	line.size.setMeasure(this.flow, content_measure - start_offset);
	padding.setStart(this.flow, start_offset);
	Args.copy(line.css, padding.getCss());
      } else if(text_align.isEnd()){
	line.size.setMeasure(this.flow, line.inlineMeasure);
	padding.setStart(this.flow, space_measure);
	Args.copy(line.css, padding.getCss());
      }
    },
    _setVertBaseline : function(elements, max_font_size, max_extent){
      var flow = this.flow;
      var base_font_size = this.getFontSize();
      var text_center = Math.floor(max_extent / 2); // center line offset

      // before align baseline, align all extents of children to max_extent.
      List.iter(elements, function(element){
	if(element instanceof Box && element.style.getMarkupName() !== "img" && element.style.display !== "inline-block"){
	  element.size.setExtent(flow, max_extent);
	}
      });

      // pickup decorated elements that has different baseline(ruby or empha)
      var decorated_elements = __filter_decorated_inline_elements(elements);
      List.iter(decorated_elements, function(element){
	var font_size = element.style.getFontSize();
	var text_center_offset = text_center - Math.floor(font_size / 2); // text displayed at half font-size minus from center line.
	if(text_center_offset > 0){
	  var edge = element.style.edge? element.style.edge.clone() : new BoxEdge();
	  edge.padding.setAfter(flow, text_center_offset); // set offset to padding

	  // set edge to dynamic css, it has higher priority over static css(given by element.style.getCssInline)
	  Args.copy(element.css, edge.getCss(flow));
	}
      });
    },
    _loadSelectorCss : function(markup, parent){
      switch(markup.getName()){
      case "before":
      case "after":
      case "first-letter":
      case "first-line":
	// notice that parent style is the style base of pseudo-element.
	return Selectors.getValuePe(parent, markup.getName());

      default:
	return Selectors.getValue(this);
      }
    },
    // nehan.js can change style dynamically by cursor-context.
    //
    // [example]
    // engine.setStyle("p", {
    //   "onload" : function(context){
    //      var min_extent = parseInt(context.getMarkup().getData("minExtent"), 10);
    //	    if(context.getRestExtent() < min_extent){
    //        return {"page-break-before":"always"};
    //      }
    //   }
    // });
    //
    // then markup "<p data-min-extent='100'>text</p>" will be broken before
    // if rest extent is less than 100.
    _loadCallbackCss : function(managed_css, name){
      var callback = managed_css.get(name);
      if(callback === null || typeof callback !== "function"){
	return {};
      }
      var ret = callback(this.selectorContext) || {};
      for(var prop in ret){
	ret[prop] = this._evalCssAttr(prop, ret[prop]);
      }
      return ret;
    },
    _loadInlineCss : function(markup){
      var style = markup.getAttr("style");
      if(style === null || Config.disableInlineStyle){
	return {};
      }
      var stmts = (style.indexOf(";") >= 0)? style.split(";") : [style];
      return List.fold(stmts, {}, function(ret, stmt){
	var nv = stmt.split(":");
	if(nv.length >= 2){
	  var prop = Utils.trim(nv[0]).toLowerCase();
	  var value = Utils.trim(nv[1]);
	  var fmt_prop = CssParser.formatProp(prop);
	  var fmt_value = CssParser.formatValue(prop, value);
	  ret[fmt_prop] = fmt_value;
	}
	return ret;
      });
    },
    _loadUnmanagedCss : function(managed_css){
      return managed_css.filter(function(prop, value){
	return !__is_managed_css_prop(prop);
      });
    },
    _disableUnmanagedCssProps : function(unmanaged_css){
      if(this.isTextVertical()){
	// unmanaged 'line-height' is not welcome for vertical-mode.
	unmanaged_css.remove("line-height");
      }
    },
    _loadDisplay : function(){
      return this.getCssAttr("display", "inline");
    },
    _loadFlow : function(){
      var value = this.getCssAttr("flow", "inherit");
      var parent_flow = this.parent? this.parent.flow : Display.getStdBoxFlow();
      if(value === "inherit"){
	return parent_flow;
      }
      if(value === "flip"){
	return parent_flow.getFlipFlow();
      }
      return BoxFlows.getByName(value);
    },
    _loadPosition : function(){
      var value = this.getCssAttr("position", "static");
      if(value === "start"){
	return null;
      }
      var position = new BoxPosition(value);
      var self = this;
      List.iter(Const.cssBoxDirsLogical, function(dir){
	var value = self.getCssAttr(dir, "auto");
	if(value !== "auto"){
	  position[value] = self._computeUnitSize(start, self.font.size);
	}
      });
      return position;
    },
    _loadColor : function(){
      var value = this.getCssAttr("color", "inherit");
      if(value !== "inherit"){
	return new Color(value);
      }
    },
    _loadFont : function(){
      var parent_font_size = this.parent? this.parent.font.size : Display.fontSize;
      var font = new Font(parent_font_size);
      var font_size = this.getCssAttr("font-size", "inherit");
      if(font_size !== "inherit"){
	font.size = this._computeFontSize(font_size, parent_font_size);
      }
      var font_family = this.getCssAttr("font-family", "inherit");
      if(font_family !== "inherit"){
	font.family = font_family;
      } else if(this.parent === null){
	font.family = Display.fontFamily;
      }
      var font_weight = this.getCssAttr("font-weight", "inherit");
      if(font_weight !== "inherit"){
	font.weight = font_weight;
      }
      var font_style = this.getCssAttr("font-style", "inherit");
      if(font_style !== "inherit"){
	font.style = font_style;
      }
      return font;
    },
    _loadBoxSizing : function(){
      return this.getCssAttr("box-sizing", "margin-box");
    },
    _loadEdge : function(flow, font_size){
      var padding = this._loadPadding(flow, font_size);
      var margin = this._loadMargin(flow, font_size);
      var border = this._loadBorder(flow, font_size);
      if(padding === null && margin === null && border === null){
	return null;
      }
      return new BoxEdge({
	padding:padding,
	margin:margin,
	border:border
      });
    },
    _loadEdgeSize : function(font_size, prop){
      var edge_size = this.getCssAttr(prop);
      if(edge_size === null){
	return null;
      }
      return this._computeEdgeSize(edge_size, font_size);
    },
    _loadPadding : function(flow, font_size){
      var edge_size = this._loadEdgeSize(font_size, "padding");
      if(edge_size === null){
	return null;
      }
      var padding = new Padding();
      padding.setSize(flow, edge_size);
      return padding;
    },
    _loadMargin : function(flow, font_size){
      var edge_size = this._loadEdgeSize(font_size, "margin");
      if(edge_size === null){
	return null;
      }
      var margin = new Margin();
      margin.setSize(flow, edge_size);

      // cancel margin between previous sibling and cur element if
      // 1. prev sibling element with edge exists.
      // 2. both prev and cur have display "block".
      // 3. both prev and cur have same box flow.
      // 4. both prev and cur is not floated element.
      // 5. prev has margin-after and cur has margin-before.
      if(this.prev && this.prev.display === "block" && !this.prev.isFloated() && this.prev.edge &&
	 this.flow === this.prev.flow &&
	 this.display === "block" && !this.isFloated() &&
	 (this.prev.edge.margin.getAfter(this.flow) > 0) &&
	 (margin.getBefore(this.flow) > 0)){
	this._cancelMargin(this.flow, margin, this.prev.edge.margin);
      }
      // if inline, disable margin-before and margin-after.
      if(this.isInline()){
	margin.clearBefore(flow);
	margin.clearAfter(flow);
      }
      return margin;
    },
    _cancelMargin : function(flow, cur_margin, prev_margin){
      var after = prev_margin.getAfter(flow);
      var before = cur_margin.getBefore(flow);
      if(after >= before){
	cur_margin.setBefore(flow, 0);
      } else {
	cur_margin.setBefore(flow, before - after);
      }
    },
    _loadBorder : function(flow, font_size){
      var edge_size = this._loadEdgeSize(font_size, "border-width");
      if(edge_size === null){
	return null;
      }
      var border = new Border();
      border.setSize(flow, edge_size);

      var border_radius = this.getCssAttr("border-radius");
      if(border_radius){
	border.setRadius(flow, this._computeCornerSize(border_radius, font_size));
      }
      var border_color = this.getCssAttr("border-color");
      if(border_color){
	border.setColor(flow, border_color);
      }
      var border_style = this.getCssAttr("border-style");
      if(border_style){
	border.setStyle(flow, border_style);
      }
      return border;
    },
    _loadLineRate : function(){
      var value = this.getCssAttr("line-rate", "inherit");
      if(value === "inherit" && this.parent && this.parent.lineRate){
	return this.parent.lineRate;
      }
      return parseFloat(value || Display.lineRate);
    },
    _loadTextAlign : function(){
      var value = this.getCssAttr("text-align", "inherit");
      if(value === "inherit" && this.parent && this.parent.textAlign){
	return this.parent.textAlign;
      }
      return TextAligns.get(value || "start");
    },
    _loadTextEmpha : function(){
      var empha_style = this.getCssAttr("text-emphasis-style", "none");
      if(empha_style === "none" || empha_style === "inherit"){
	return null;
      }
      var empha_pos = this.getCssAttr("text-emphasis-position", {hori:"over", vert:"right"});
      var empha_color = this.getCssAttr("text-emphasis-color");
      return new TextEmpha({
	style:new TextEmphaStyle(empha_style),
	pos:new TextEmphaPos(empha_pos),
	color:(empha_color? new Color(empha_color) : this.getColor())
      });
    },
    _loadTextEmphaStyle : function(){
      var value = this.getCssAttr("text-emphasis-style", "inherit");
      return (value !== "inherit")? new TextEmphaStyle(value) : null;
    },
    _loadTextEmphaPos : function(){
      return this.getCssAttr("text-emphasis-position", {hori:"over", vert:"right"});
    },
    _loadTextEmphaColor : function(color){
      return this.getCssAttr("text-emphasis-color", color.getValue());
    },
    _loadTextCombine : function(){
      return this.getCssAttr("text-combine");
    },
    _loadFloatDirection : function(){
      var name = this.getCssAttr("float", "none");
      if(name === "none"){
	return null;
      }
      return FloatDirections.get(name);
    },
    _loadBreakBefore : function(){
      var value = this.getCssAttr("break-before");
      return value? Breaks.getBefore(value) : null;
    },
    _loadBreakAfter : function(){
      var value = this.getCssAttr("break-after");
      return value? Breaks.getAfter(value) : null;
    },
    _loadWordBreak : function(){
      return this.getCssAttr("word-break");
    },
    _loadListStyle : function(){
      var list_style_type = this.getCssAttr("list-style-type", "none");
      if(list_style_type === "none"){
	return null;
      }
      return new ListStyle({
	type:list_style_type,
	position:this.getCssAttr("list-style-position", "outside"),
	image:this.getCssAttr("list-style-image", "none")
      });
    },
    _loadLetterSpacing : function(font_size){
      var letter_spacing = this.getCssAttr("letter-spacing");
      if(letter_spacing){
	return this._computeUnitSize(letter_spacing, font_size);
      }
    },
    _loadStaticMeasure : function(){
      var prop = this.flow.getPropMeasure();
      var max_size = this.getParentContentMeasure();
      var static_size = this.getAttr(prop) || this.getAttr("measure") || this.getCssAttr(prop) || this.getCssAttr("measure");
      return static_size? this._computeUnitSize(static_size, this.font.size, max_size) : null;
    },
    _loadStaticExtent : function(){
      var prop = this.flow.getPropExtent();
      var max_size = this.getParentContentExtent();
      var static_size = this.getAttr(prop) || this.getAttr("extent") || this.getCssAttr(prop) || this.getCssAttr("extent");
      return static_size? this._computeUnitSize(static_size, this.font.size, max_size) : null;
    }
  };

  return StyleContext;
})();

