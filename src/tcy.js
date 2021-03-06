var Tcy = (function(){
  /**
     @memberof Nehan
     @class Tcy
     @classdesc abstraction of tcy(tate-chu-yoko) character.
     @constructor
     @param tcy {String}
  */
  function Tcy(tcy){
    this.data = tcy;
    this._type = "tcy";
  }

  Tcy.prototype = {
    /**
       @memberof Nehan.Tcy
       @return {int}
    */
    getCharCount : function(){
      return 1;
    },
    /**
       @memberof Nehan.Tcy
       @return {int}
    */
    getAdvance : function(flow, letter_spacing){
      return this.bodySize + letter_spacing;
    },
    /**
       @memberof Nehan.Tcy
       @return {boolean}
    */
    hasMetrics : function(){
      return (typeof this.bodySize != "undefined");
    },
    /**
       @memberof Nehan.Tcy
       @param flow {Nehan.BoxFlow}
       @param font {Nehan.Font}
    */
    setMetrics : function(flow, font){
      this.bodySize = font.size;
    }
  };

  return Tcy;
})();

