var FirstLineGenerator = (function(){
  /**
   * style of first line generator is enabled until first line is yielded.<br>
   * after yielding first line, parent style is inherited.
   @memberof Nehan
   @class FirstLineGenerator
   @classdesc generator to yield first line block.
   @constructor
   @param style {Nehan.StyleContext}
   @param stream {Nehan.TokenStream}
   @extends {Nehan.BlockGenerator}
  */
  function FirstLineGenerator(style, stream){
    BlockGenerator.call(this, style, stream);
  }
  Class.extend(FirstLineGenerator, BlockGenerator);

  FirstLineGenerator.prototype._onAddElement = function(element){
    if(element.display === "inline" && typeof this._first === "undefined"){
      this._first = true; // flag that first line is already generated.
      this.style = this.style.parent; // first-line yieled, so switch style to parent one.
      if(this._childLayout){
	this._childLayout.style = this.style;
      }
    }
  };

  return FirstLineGenerator;
})();

