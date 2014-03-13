/**
 * Copyright 2010 Tim Down.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * jshashtable
 *
 * jshashtable is a JavaScript implementation of a hash table. It creates a single constructor function called Hashtable
 * in the global scope.
 *
 * Author: Tim Down <tim@timdown.co.uk>
 * Version: 2.1
 * Build date: 21 March 2010
 * Website: http://www.timdown.co.uk/jshashtable
 */

var Hashtable = (function() {
	var FUNCTION = "function";

	var arrayRemoveAt = (typeof Array.prototype.splice == FUNCTION) ?
		function(arr, idx) {
			arr.splice(idx, 1);
		} :

		function(arr, idx) {
			var itemsAfterDeleted, i, len;
			if (idx === arr.length - 1) {
				arr.length = idx;
			} else {
				itemsAfterDeleted = arr.slice(idx + 1);
				arr.length = idx;
				for (i = 0, len = itemsAfterDeleted.length; i < len; ++i) {
					arr[idx + i] = itemsAfterDeleted[i];
				}
			}
		};

	function hashObject(obj) {
		var hashCode;
		if (typeof obj == "string") {
			return obj;
		} else if (typeof obj.hashCode == FUNCTION) {
			// Check the hashCode method really has returned a string
			hashCode = obj.hashCode();
			return (typeof hashCode == "string") ? hashCode : hashObject(hashCode);
		} else if (typeof obj.toString == FUNCTION) {
			return obj.toString();
		} else {
			try {
				return String(obj);
			} catch (ex) {
				// For host objects (such as ActiveObjects in IE) that have no toString() method and throw an error when
				// passed to String()
				return Object.prototype.toString.call(obj);
			}
		}
	}

	function equals_fixedValueHasEquals(fixedValue, variableValue) {
		return fixedValue.equals(variableValue);
	}

	function equals_fixedValueNoEquals(fixedValue, variableValue) {
		return (typeof variableValue.equals == FUNCTION) ?
			   variableValue.equals(fixedValue) : (fixedValue === variableValue);
	}

	function createKeyValCheck(kvStr) {
		return function(kv) {
			if (kv === null) {
				throw new Error("null is not a valid " + kvStr);
			} else if (typeof kv == "undefined") {
				throw new Error(kvStr + " must not be undefined");
			}
		};
	}

	var checkKey = createKeyValCheck("key"), checkValue = createKeyValCheck("value");

	/*----------------------------------------------------------------------------------------------------------------*/

	function Bucket(hash, firstKey, firstValue, equalityFunction) {
        this[0] = hash;
		this.entries = [];
		this.addEntry(firstKey, firstValue);

		if (equalityFunction !== null) {
			this.getEqualityFunction = function() {
				return equalityFunction;
			};
		}
	}

	var EXISTENCE = 0, ENTRY = 1, ENTRY_INDEX_AND_VALUE = 2;

	function createBucketSearcher(mode) {
		return function(key) {
			var i = this.entries.length, entry, equals = this.getEqualityFunction(key);
			while (i--) {
				entry = this.entries[i];
				if ( equals(key, entry[0]) ) {
					switch (mode) {
						case EXISTENCE:
							return true;
						case ENTRY:
							return entry;
						case ENTRY_INDEX_AND_VALUE:
							return [ i, entry[1] ];
					}
				}
			}
			return false;
		};
	}

	function createBucketLister(entryProperty) {
		return function(aggregatedArr) {
			var startIndex = aggregatedArr.length;
			for (var i = 0, len = this.entries.length; i < len; ++i) {
				aggregatedArr[startIndex + i] = this.entries[i][entryProperty];
			}
		};
	}

	Bucket.prototype = {
		getEqualityFunction: function(searchValue) {
			return (typeof searchValue.equals == FUNCTION) ? equals_fixedValueHasEquals : equals_fixedValueNoEquals;
		},

		getEntryForKey: createBucketSearcher(ENTRY),

		getEntryAndIndexForKey: createBucketSearcher(ENTRY_INDEX_AND_VALUE),

		removeEntryForKey: function(key) {
			var result = this.getEntryAndIndexForKey(key);
			if (result) {
				arrayRemoveAt(this.entries, result[0]);
				return result[1];
			}
			return null;
		},

		addEntry: function(key, value) {
			this.entries[this.entries.length] = [key, value];
		},

		keys: createBucketLister(0),

		values: createBucketLister(1),

		getEntries: function(entries) {
			var startIndex = entries.length;
			for (var i = 0, len = this.entries.length; i < len; ++i) {
				// Clone the entry stored in the bucket before adding to array
				entries[startIndex + i] = this.entries[i].slice(0);
			}
		},

		containsKey: createBucketSearcher(EXISTENCE),

		containsValue: function(value) {
			var i = this.entries.length;
			while (i--) {
				if ( value === this.entries[i][1] ) {
					return true;
				}
			}
			return false;
		}
	};

	/*----------------------------------------------------------------------------------------------------------------*/

	// Supporting functions for searching hashtable buckets

	function searchBuckets(buckets, hash) {
		var i = buckets.length, bucket;
		while (i--) {
			bucket = buckets[i];
			if (hash === bucket[0]) {
				return i;
			}
		}
		return null;
	}

	function getBucketForHash(bucketsByHash, hash) {
		var bucket = bucketsByHash[hash];

		// Check that this is a genuine bucket and not something inherited from the bucketsByHash's prototype
		return ( bucket && (bucket instanceof Bucket) ) ? bucket : null;
	}

	/*----------------------------------------------------------------------------------------------------------------*/

	function Hashtable(hashingFunctionParam, equalityFunctionParam) {
		var that = this;
		var buckets = [];
		var bucketsByHash = {};

		var hashingFunction = (typeof hashingFunctionParam == FUNCTION) ? hashingFunctionParam : hashObject;
		var equalityFunction = (typeof equalityFunctionParam == FUNCTION) ? equalityFunctionParam : null;

		this.put = function(key, value) {
			checkKey(key);
			checkValue(value);
			var hash = hashingFunction(key), bucket, bucketEntry, oldValue = null;

			// Check if a bucket exists for the bucket key
			bucket = getBucketForHash(bucketsByHash, hash);
			if (bucket) {
				// Check this bucket to see if it already contains this key
				bucketEntry = bucket.getEntryForKey(key);
				if (bucketEntry) {
					// This bucket entry is the current mapping of key to value, so replace old value and we're done.
					oldValue = bucketEntry[1];
					bucketEntry[1] = value;
				} else {
					// The bucket does not contain an entry for this key, so add one
					bucket.addEntry(key, value);
				}
			} else {
				// No bucket exists for the key, so create one and put our key/value mapping in
				bucket = new Bucket(hash, key, value, equalityFunction);
				buckets[buckets.length] = bucket;
				bucketsByHash[hash] = bucket;
			}
			return oldValue;
		};

		this.get = function(key) {
			checkKey(key);

			var hash = hashingFunction(key);

			// Check if a bucket exists for the bucket key
			var bucket = getBucketForHash(bucketsByHash, hash);
			if (bucket) {
				// Check this bucket to see if it contains this key
				var bucketEntry = bucket.getEntryForKey(key);
				if (bucketEntry) {
					// This bucket entry is the current mapping of key to value, so return the value.
					return bucketEntry[1];
				}
			}
			return null;
		};

		this.containsKey = function(key) {
			checkKey(key);
			var bucketKey = hashingFunction(key);

			// Check if a bucket exists for the bucket key
			var bucket = getBucketForHash(bucketsByHash, bucketKey);

			return bucket ? bucket.containsKey(key) : false;
		};

		this.containsValue = function(value) {
			checkValue(value);
			var i = buckets.length;
			while (i--) {
				if (buckets[i].containsValue(value)) {
					return true;
				}
			}
			return false;
		};

		this.clear = function() {
			buckets.length = 0;
			bucketsByHash = {};
		};

		this.isEmpty = function() {
			return !buckets.length;
		};

		var createBucketAggregator = function(bucketFuncName) {
			return function() {
				var aggregated = [], i = buckets.length;
				while (i--) {
					buckets[i][bucketFuncName](aggregated);
				}
				return aggregated;
			};
		};

		this.keys = createBucketAggregator("keys");
		this.values = createBucketAggregator("values");
		this.entries = createBucketAggregator("getEntries");

		this.remove = function(key) {
			checkKey(key);

			var hash = hashingFunction(key), bucketIndex, oldValue = null;

			// Check if a bucket exists for the bucket key
			var bucket = getBucketForHash(bucketsByHash, hash);

			if (bucket) {
				// Remove entry from this bucket for this key
				oldValue = bucket.removeEntryForKey(key);
				if (oldValue !== null) {
					// Entry was removed, so check if bucket is empty
					if (!bucket.entries.length) {
						// Bucket is empty, so remove it from the bucket collections
						bucketIndex = searchBuckets(buckets, hash);
						arrayRemoveAt(buckets, bucketIndex);
						delete bucketsByHash[hash];
					}
				}
			}
			return oldValue;
		};

		this.size = function() {
			var total = 0, i = buckets.length;
			while (i--) {
				total += buckets[i].entries.length;
			}
			return total;
		};

		this.each = function(callback) {
			var entries = that.entries(), i = entries.length, entry;
			while (i--) {
				entry = entries[i];
				callback(entry[0], entry[1]);
			}
		};

		this.putAll = function(hashtable, conflictCallback) {
			var entries = hashtable.entries();
			var entry, key, value, thisValue, i = entries.length;
			var hasConflictCallback = (typeof conflictCallback == FUNCTION);
			while (i--) {
				entry = entries[i];
				key = entry[0];
				value = entry[1];

				// Check for a conflict. The default behaviour is to overwrite the value for an existing key
				if ( hasConflictCallback && (thisValue = that.get(key)) ) {
					value = conflictCallback(key, thisValue, value);
				}
				that.put(key, value);
			}
		};

		this.clone = function() {
			var clone = new Hashtable(hashingFunctionParam, equalityFunctionParam);
			clone.putAll(that);
			return clone;
		};
	}

	return Hashtable;
})();;// Simple JavaScript Templating
// John Resig - http://ejohn.org/ - MIT Licensed
(function(){
  var cache = {};
  
  this.tmpl = function tmpl(str, data){
    // Figure out if we're getting a template, or if we need to
    // load the template - and be sure to cache the result.
    var fn = !/\W/.test(str) ?
      cache[str] = cache[str] ||
        tmpl(document.getElementById(str).innerHTML) :
      
      // Generate a reusable function that will serve as a template
      // generator (and which will be cached).
      new Function("obj",
        "var p=[],print=function(){p.push.apply(p,arguments);};" +
        
        // Introduce the data as local variables using with(){}
        "with(obj){p.push('" +
        
        // Convert the template into pure JavaScript
        str
          .replace(/[\r\t\n]/g, " ")
          .split("<%").join("\t")
          .replace(/((^|%>)[^\t]*)'/g, "$1\r")
          .replace(/\t=(.*?)%>/g, "',$1,'")
          .split("\t").join("');")
          .split("%>").join("p.push('")
          .split("\r").join("\\'")
      + "');}return p.join('');");
    
    // Provide some basic currying to the user
    return data ? fn( data ) : fn;
  };
})();;/**
 * jquery.dependClass - Attach class based on first class in list of current element
 * 
 * Written by
 * Egor Khmelev (hmelyoff@gmail.com)
 *
 * Licensed under the MIT (MIT-LICENSE.txt).
 *
 * @author Egor Khmelev
 * @version 0.1.0-BETA ($Id$)
 * 
 **/

(function($) {
	$.baseClass = function(obj){
	  obj = $(obj);
	  return obj.get(0).className.match(/([^ ]+)/)[1];
	};
	
	$.fn.addDependClass = function(className, delimiter){
		var options = {
		  delimiter: delimiter ? delimiter : '-'
		}
		return this.each(function(){
		  var baseClass = $.baseClass(this);
		  if(baseClass)
    		$(this).addClass(baseClass + options.delimiter + className);
		});
	};

	$.fn.removeDependClass = function(className, delimiter){
		var options = {
		  delimiter: delimiter ? delimiter : '-'
		}
		return this.each(function(){
		  var baseClass = $.baseClass(this);
		  if(baseClass)
    		$(this).removeClass(baseClass + options.delimiter + className);
		});
	};

	$.fn.toggleDependClass = function(className, delimiter){
		var options = {
		  delimiter: delimiter ? delimiter : '-'
		}
		return this.each(function(){
		  var baseClass = $.baseClass(this);
		  if(baseClass)
		    if($(this).is("." + baseClass + options.delimiter + className))
    		  $(this).removeClass(baseClass + options.delimiter + className);
    		else
    		  $(this).addClass(baseClass + options.delimiter + className);
		});
	};

})(jQuery);;/**
 * jquery.numberformatter - Formatting/Parsing Numbers in jQuery
 * 
 * Written by
 * Michael Abernethy (mike@abernethysoft.com),
 * Andrew Parry (aparry0@gmail.com)
 *
 * Dual licensed under the MIT (MIT-LICENSE.txt)
 * and GPL (GPL-LICENSE.txt) licenses.
 *
 * @author Michael Abernethy, Andrew Parry
 * @version 1.2.3-SNAPSHOT ($Id$)
 * 
 * Dependencies
 * 
 * jQuery (http://jquery.com)
 * jshashtable (http://www.timdown.co.uk/jshashtable)
 * 
 * Notes & Thanks
 * 
 * many thanks to advweb.nanasi.jp for his bug fixes
 * jsHashtable is now used also, so thanks to the author for that excellent little class.
 *
 * This plugin can be used to format numbers as text and parse text as Numbers
 * Because we live in an international world, we cannot assume that everyone
 * uses "," to divide thousands, and "." as a decimal point.
 *
 * As of 1.2 the way this plugin works has changed slightly, parsing text to a number
 * has 1 set of functions, formatting a number to text has it's own. Before things
 * were a little confusing, so I wanted to separate the 2 out more.
 *
 *
 * jQuery extension functions:
 *
 * formatNumber(options, writeBack, giveReturnValue) - Reads the value from the subject, parses to
 * a Javascript Number object, then formats back to text using the passed options and write back to
 * the subject.
 * 
 * parseNumber(options) - Parses the value in the subject to a Number object using the passed options
 * to decipher the actual number from the text, then writes the value as text back to the subject.
 * 
 * 
 * Generic functions:
 * 
 * formatNumber(numberString, options) - Takes a plain number as a string (e.g. '1002.0123') and returns
 * a string of the given format options.
 * 
 * parseNumber(numberString, options) - Takes a number as text that is formatted the same as the given
 * options then and returns it as a plain Number object.
 * 
 * To achieve the old way of combining parsing and formatting to keep say a input field always formatted
 * to a given format after it has lost focus you'd simply use a combination of the functions.
 * 
 * e.g.
 * $("#salary").blur(function(){
 * 		$(this).parseNumber({format:"#,###.00", locale:"us"});
 * 		$(this).formatNumber({format:"#,###.00", locale:"us"});
 * });
 *
 * The syntax for the formatting is:
 * 0 = Digit
 * # = Digit, zero shows as absent
 * . = Decimal separator
 * - = Negative sign
 * , = Grouping Separator
 * % = Percent (multiplies the number by 100)
 * 
 * For example, a format of "#,###.00" and text of 4500.20 will
 * display as "4.500,20" with a locale of "de", and "4,500.20" with a locale of "us"
 *
 *
 * As of now, the only acceptable locales are 
 * Arab Emirates -> "ae"
 * Australia -> "au"
 * Austria -> "at"
 * Brazil -> "br"
 * Canada -> "ca"
 * China -> "cn"
 * Czech -> "cz"
 * Denmark -> "dk"
 * Egypt -> "eg"
 * Finland -> "fi"
 * France  -> "fr"
 * Germany -> "de"
 * Greece -> "gr"
 * Great Britain -> "gb"
 * Hong Kong -> "hk"
 * India -> "in"
 * Israel -> "il"
 * Japan -> "jp"
 * Russia -> "ru"
 * South Korea -> "kr"
 * Spain -> "es"
 * Sweden -> "se"
 * Switzerland -> "ch"
 * Taiwan -> "tw"
 * Thailand -> "th"
 * United States -> "us"
 * Vietnam -> "vn"
 **/

(function(jQuery) {

	var nfLocales = new Hashtable();
	
	var nfLocalesLikeUS = [ 'ae','au','ca','cn','eg','gb','hk','il','in','jp','sk','th','tw','us' ];
	var nfLocalesLikeDE = [ 'at','br','de','dk','es','gr','it','nl','pt','tr','vn' ];
	var nfLocalesLikeFR = [ 'cz','fi','fr','ru','se','pl' ];
	var nfLocalesLikeCH = [ 'ch' ];
	
	var nfLocaleFormatting = [ [".", ","], [",", "."], [",", " "], [".", "'"] ]; 
	var nfAllLocales = [ nfLocalesLikeUS, nfLocalesLikeDE, nfLocalesLikeFR, nfLocalesLikeCH ]

	function FormatData(dec, group, neg) {
		this.dec = dec;
		this.group = group;
		this.neg = neg;
	};

	function init() {
		// write the arrays into the hashtable
		for (var localeGroupIdx = 0; localeGroupIdx < nfAllLocales.length; localeGroupIdx++) {
			localeGroup = nfAllLocales[localeGroupIdx];
			for (var i = 0; i < localeGroup.length; i++) {
				nfLocales.put(localeGroup[i], localeGroupIdx);
			}
		}
	};

	function formatCodes(locale, isFullLocale) {
		if (nfLocales.size() == 0)
			init();

         // default values
         var dec = ".";
         var group = ",";
         var neg = "-";
         
         if (isFullLocale == false) {
	         // Extract and convert to lower-case any language code from a real 'locale' formatted string, if not use as-is
	         // (To prevent locale format like : "fr_FR", "en_US", "de_DE", "fr_FR", "en-US", "de-DE")
	         if (locale.indexOf('_') != -1)
				locale = locale.split('_')[1].toLowerCase();
			 else if (locale.indexOf('-') != -1)
				locale = locale.split('-')[1].toLowerCase();
		}

		 // hashtable lookup to match locale with codes
		 var codesIndex = nfLocales.get(locale);
		 if (codesIndex) {
		 	var codes = nfLocaleFormatting[codesIndex];
			if (codes) {
				dec = codes[0];
				group = codes[1];
			}
		 }
		 return new FormatData(dec, group, neg);
    };
	
	
	/*	Formatting Methods	*/
	
	
	/**
	 * Formats anything containing a number in standard js number notation.
	 * 
	 * @param {Object}	options			The formatting options to use
	 * @param {Boolean}	writeBack		(true) If the output value should be written back to the subject
	 * @param {Boolean} giveReturnValue	(true) If the function should return the output string
	 */
	jQuery.fn.formatNumber = function(options, writeBack, giveReturnValue) {
	
		return this.each(function() {
			// enforce defaults
			if (writeBack == null)
				writeBack = true;
			if (giveReturnValue == null)
				giveReturnValue = true;
			
			// get text
			var text;
			if (jQuery(this).is(":input"))
				text = new String(jQuery(this).val());
			else
				text = new String(jQuery(this).text());

			// format
			var returnString = jQuery.formatNumber(text, options);
		
			// set formatted string back, only if a success
//			if (returnString) {
				if (writeBack) {
					if (jQuery(this).is(":input"))
						jQuery(this).val(returnString);
					else
						jQuery(this).text(returnString);
				}
				if (giveReturnValue)
					return returnString;
//			}
//			return '';
		});
	};
	
	/**
	 * First parses a string and reformats it with the given options.
	 * 
	 * @param {Object} numberString
	 * @param {Object} options
	 */
	jQuery.formatNumber = function(numberString, options){
		var options = jQuery.extend({}, jQuery.fn.formatNumber.defaults, options);
		var formatData = formatCodes(options.locale.toLowerCase(), options.isFullLocale);
		
		var dec = formatData.dec;
		var group = formatData.group;
		var neg = formatData.neg;
		
		var validFormat = "0#-,.";
		
		// strip all the invalid characters at the beginning and the end
		// of the format, and we'll stick them back on at the end
		// make a special case for the negative sign "-" though, so 
		// we can have formats like -$23.32
		var prefix = "";
		var negativeInFront = false;
		for (var i = 0; i < options.format.length; i++) {
			if (validFormat.indexOf(options.format.charAt(i)) == -1) 
				prefix = prefix + options.format.charAt(i);
			else 
				if (i == 0 && options.format.charAt(i) == '-') {
					negativeInFront = true;
					continue;
				}
				else 
					break;
		}
		var suffix = "";
		for (var i = options.format.length - 1; i >= 0; i--) {
			if (validFormat.indexOf(options.format.charAt(i)) == -1) 
				suffix = options.format.charAt(i) + suffix;
			else 
				break;
		}
		
		options.format = options.format.substring(prefix.length);
		options.format = options.format.substring(0, options.format.length - suffix.length);
		
		// now we need to convert it into a number
		//while (numberString.indexOf(group) > -1) 
		//	numberString = numberString.replace(group, '');
		//var number = new Number(numberString.replace(dec, ".").replace(neg, "-"));
		var number = new Number(numberString);
		
		return jQuery._formatNumber(number, options, suffix, prefix, negativeInFront);
	};
	
	/**
	 * Formats a Number object into a string, using the given formatting options
	 * 
	 * @param {Object} numberString
	 * @param {Object} options
	 */
	jQuery._formatNumber = function(number, options, suffix, prefix, negativeInFront) {
		var options = jQuery.extend({}, jQuery.fn.formatNumber.defaults, options);
		var formatData = formatCodes(options.locale.toLowerCase(), options.isFullLocale);
		
		var dec = formatData.dec;
		var group = formatData.group;
		var neg = formatData.neg;
		
		var forcedToZero = false;
		if (isNaN(number)) {
			if (options.nanForceZero == true) {
				number = 0;
				forcedToZero = true;
			} else 
				return null;
		}

		// special case for percentages
        if (suffix == "%")
        	number = number * 100;

		var returnString = "";
		if (options.format.indexOf(".") > -1) {
			var decimalPortion = dec;
			var decimalFormat = options.format.substring(options.format.lastIndexOf(".") + 1);
			
			// round or truncate number as needed
			if (options.round == true)
				number = new Number(number.toFixed(decimalFormat.length));
			else {
				var numStr = number.toString();
				numStr = numStr.substring(0, numStr.lastIndexOf('.') + decimalFormat.length + 1);
				number = new Number(numStr);
			}
			
			var decimalValue = number % 1;
			var decimalString = new String(decimalValue.toFixed(decimalFormat.length));
			decimalString = decimalString.substring(decimalString.lastIndexOf(".") + 1);
			
			for (var i = 0; i < decimalFormat.length; i++) {
				if (decimalFormat.charAt(i) == '#' && decimalString.charAt(i) != '0') {
                	decimalPortion += decimalString.charAt(i);
					continue;
				} else if (decimalFormat.charAt(i) == '#' && decimalString.charAt(i) == '0') {
					var notParsed = decimalString.substring(i);
					if (notParsed.match('[1-9]')) {
						decimalPortion += decimalString.charAt(i);
						continue;
					} else
						break;
				} else if (decimalFormat.charAt(i) == "0")
					decimalPortion += decimalString.charAt(i);
			}
			returnString += decimalPortion
         } else
			number = Math.round(number);

		var ones = Math.floor(number);
		if (number < 0)
			ones = Math.ceil(number);

		var onesFormat = "";
		if (options.format.indexOf(".") == -1)
			onesFormat = options.format;
		else
			onesFormat = options.format.substring(0, options.format.indexOf("."));

		var onePortion = "";
		if (!(ones == 0 && onesFormat.substr(onesFormat.length - 1) == '#') || forcedToZero) {
			// find how many digits are in the group
			var oneText = new String(Math.abs(ones));
			var groupLength = 9999;
			if (onesFormat.lastIndexOf(",") != -1)
				groupLength = onesFormat.length - onesFormat.lastIndexOf(",") - 1;
			var groupCount = 0;
			for (var i = oneText.length - 1; i > -1; i--) {
				onePortion = oneText.charAt(i) + onePortion;
				groupCount++;
				if (groupCount == groupLength && i != 0) {
					onePortion = group + onePortion;
					groupCount = 0;
				}
			}
			
			// account for any pre-data padding
			if (onesFormat.length > onePortion.length) {
				var padStart = onesFormat.indexOf('0');
				if (padStart != -1) {
					var padLen = onesFormat.length - padStart;
					
					// pad to left with 0's or group char
					var pos = onesFormat.length - onePortion.length - 1;
					while (onePortion.length < padLen) {
						var padChar = onesFormat.charAt(pos);
						// replace with real group char if needed
						if (padChar == ',')
							padChar = group;
						onePortion = padChar + onePortion;
						pos--;
					}
				}
			}
		}
		
		if (!onePortion && onesFormat.indexOf('0', onesFormat.length - 1) !== -1)
   			onePortion = '0';

		returnString = onePortion + returnString;

		// handle special case where negative is in front of the invalid characters
		if (number < 0 && negativeInFront && prefix.length > 0)
			prefix = neg + prefix;
		else if (number < 0)
			returnString = neg + returnString;
		
		if (!options.decimalSeparatorAlwaysShown) {
			if (returnString.lastIndexOf(dec) == returnString.length - 1) {
				returnString = returnString.substring(0, returnString.length - 1);
			}
		}
		returnString = prefix + returnString + suffix;
		return returnString;
	};


	/*	Parsing Methods	*/


	/**
	 * Parses a number of given format from the element and returns a Number object.
	 * @param {Object} options
	 */
	jQuery.fn.parseNumber = function(options, writeBack, giveReturnValue) {
		// enforce defaults
		if (writeBack == null)
			writeBack = true;
		if (giveReturnValue == null)
			giveReturnValue = true;
		
		// get text
		var text;
		if (jQuery(this).is(":input"))
			text = new String(jQuery(this).val());
		else
			text = new String(jQuery(this).text());
	
		// parse text
		var number = jQuery.parseNumber(text, options);
		
		if (number) {
			if (writeBack) {
				if (jQuery(this).is(":input"))
					jQuery(this).val(number.toString());
				else
					jQuery(this).text(number.toString());
			}
			if (giveReturnValue)
				return number;
		}
	};
	
	/**
	 * Parses a string of given format into a Number object.
	 * 
	 * @param {Object} string
	 * @param {Object} options
	 */
	jQuery.parseNumber = function(numberString, options) {
		var options = jQuery.extend({}, jQuery.fn.parseNumber.defaults, options);
		var formatData = formatCodes(options.locale.toLowerCase(), options.isFullLocale);

		var dec = formatData.dec;
		var group = formatData.group;
		var neg = formatData.neg;

		var valid = "1234567890.-";
		
		// now we need to convert it into a number
		while (numberString.indexOf(group)>-1)
			numberString = numberString.replace(group,'');
		numberString = numberString.replace(dec,".").replace(neg,"-");
		var validText = "";
		var hasPercent = false;
		if (numberString.charAt(numberString.length - 1) == "%" || options.isPercentage == true)
			hasPercent = true;
		for (var i=0; i<numberString.length; i++) {
			if (valid.indexOf(numberString.charAt(i))>-1)
				validText = validText + numberString.charAt(i);
		}
		var number = new Number(validText);
		if (hasPercent) {
			number = number / 100;
			var decimalPos = validText.indexOf('.');
			if (decimalPos != -1) {
				var decimalPoints = validText.length - decimalPos - 1;
				number = number.toFixed(decimalPoints + 2);
			} else {
				number = number.toFixed(validText.length - 1);
			}
		}

		return number;
	};

	jQuery.fn.parseNumber.defaults = {
		locale: "us",
		decimalSeparatorAlwaysShown: false,
		isPercentage: false,
		isFullLocale: false
	};

	jQuery.fn.formatNumber.defaults = {
		format: "#,###.00",
		locale: "us",
		decimalSeparatorAlwaysShown: false,
		nanForceZero: true,
		round: true,
		isFullLocale: false
	};
	
	Number.prototype.toFixed = function(precision) {
    	return jQuery._roundNumber(this, precision);
	};
	
	jQuery._roundNumber = function(number, decimalPlaces) {
		var power = Math.pow(10, decimalPlaces || 0);
    	var value = String(Math.round(number * power) / power);
    	
    	// ensure the decimal places are there
    	if (decimalPlaces > 0) {
    		var dp = value.indexOf(".");
    		if (dp == -1) {
    			value += '.';
    			dp = 0;
    		} else {
    			dp = value.length - (dp + 1);
    		}
    		
    		while (dp < decimalPlaces) {
    			value += '0';
    			dp++;
    		}
    	}
    	return value;
	};

 })(jQuery);;
var SliderDraggable = (function () {
    function SliderDraggable(pointer, uid, slider) {
        this.defaultIs = {
            drag: false,
            clicked: false,
            toclick: true,
            mouseup: false
        };
        this.init(pointer);
        this.onInit(pointer, uid, slider);
    }
    SliderDraggable.prototype.init = function (pointer) {
        if (arguments.length > 0) {
            this.pointer = $(pointer);
            this.outer = $('.draggable-outer');
        }

        var offset = this.getPointerOffset();

        this.is = $.extend(this.is, this.defaultIs);

        this.d = {
            left: offset.left,
            top: offset.top,
            width: this.pointer.width(),
            height: this.pointer.height()
        };

        this.events = {
            down: 'touch',
            move: 'drag',
            up: 'release',
            click: 'tap'
        };

        this.setupEvents();
    };

    SliderDraggable.prototype.setupEvents = function () {
        var _this = this;
        this.bind($(document), SliderDraggable.EVENT_MOVE, function (event) {
            if (_this.is.drag) {
                event.gesture.preventDefault();
                event.gesture.stopPropagation();

                _this.mouseMove(event);
            }
        });

        this.bind($(document), SliderDraggable.EVENT_DOWN, function (event) {
            if (_this.is.drag) {
                event.gesture.preventDefault();
                event.gesture.stopPropagation();
            }
        });

        this.bind(this.pointer, SliderDraggable.EVENT_MOVE, function (event) {
            if (_this.is.drag) {
                event.gesture.preventDefault();
                event.gesture.stopPropagation();

                _this.mouseMove(event);
            }
        });

        this.bind(this.pointer, SliderDraggable.EVENT_DOWN, function (event) {
            _this.mouseDown(event);
            return false;
        });

        this.bind(this.pointer, SliderDraggable.EVENT_UP, function (event) {
            _this.mouseUp(event);
        });

        this.bind(this.pointer, SliderDraggable.EVENT_CLICK, function () {
            _this.is.clicked = true;

            if (!_this.is.toclick) {
                _this.is.toclick = true;
                return false;
            }

            return true;
        });
    };

    SliderDraggable.prototype.getPageCoords = function (event) {
        var touchList = event.gesture.touches;
        return {
            x: touchList[0].pageX,
            y: touchList[0].pageY
        };
    };

    SliderDraggable.prototype.getPointerOffset = function () {
        return this.pointer.offset();
    };

    SliderDraggable.prototype.unbind = function () {
        for (var eventType in this.events) {
            var namespacedEvent = this.events[eventType];
            $(document).hammer().off(namespacedEvent);
            this.pointer.hammer().off(namespacedEvent);
        }
    };

    SliderDraggable.prototype.bind = function (element, eventType, callback) {
        var namespacedEvent = this.events[eventType];

        Hammer(element.get(0)).on(namespacedEvent, callback);
    };

    SliderDraggable.prototype.mouseDown = function (event) {
        this.is.drag = true;
        this.is.mouseup = this.is.clicked = false;

        var offset = this.getPointerOffset(), coords = this.getPageCoords(event);

        this.cursorX = coords.x - offset.left;
        this.cursorY = coords.y - offset.top;

        this.d = $.extend(this.d, {
            left: offset.left,
            top: offset.top,
            width: this.pointer.width(),
            height: this.pointer.height()
        });

        if (this.outer.length > 0) {
            this.outer.css({
                height: Math.max(this.outer.height(), $(document.body).height()),
                overflow: 'hidden'
            });
        }

        this.onMouseDown(event);
    };

    SliderDraggable.prototype.mouseMove = function (event) {
        this.is.toclick = false;
        var coords = this.getPageCoords(event);
        this.onMouseMove(event, coords.x - this.cursorX, coords.y - this.cursorY);
    };

    SliderDraggable.prototype.mouseUp = function (event) {
        if (!this.is.drag) {
            return;
        }

        this.is.drag = false;

        if (this.outer.length > 0 && (navigator.userAgent.indexOf('compatible') < 0 && /(mozilla)(?:.*? rv:([\w.]+)|)/i.test(navigator.userAgent))) {
            this.outer.css({ overflow: 'hidden' });
        } else {
            this.outer.css({ overflow: 'visible' });
        }

        this.onMouseUp(event);
    };

    SliderDraggable.prototype.onInit = function (pointer, id, constructor) {
    };

    SliderDraggable.prototype.onMouseDown = function (event) {
        this.pointer.css({ position: 'absolute' });
    };

    SliderDraggable.prototype.onMouseMove = function (event, x, y) {
        if (typeof x === "undefined") { x = null; }
        if (typeof y === "undefined") { y = null; }
    };

    SliderDraggable.prototype.onMouseUp = function (event) {
    };

    SliderDraggable.prototype.destroy = function () {
        this.unbind();
        this.pointer.remove();
    };
    SliderDraggable.EVENT_NAMESPACE = '.sliderDraggable';
    SliderDraggable.EVENT_CLICK = 'click';
    SliderDraggable.EVENT_UP = 'up';
    SliderDraggable.EVENT_MOVE = 'move';
    SliderDraggable.EVENT_DOWN = 'down';
    return SliderDraggable;
})();
;var __extends = this.__extends || function (d, b) {
    for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
    function __() { this.constructor = d; }
    __.prototype = b.prototype;
    d.prototype = new __();
};
var SliderPointer = (function (_super) {
    __extends(SliderPointer, _super);
    function SliderPointer() {
        _super.apply(this, arguments);
    }
    SliderPointer.prototype.onInit = function (pointer, id, slider) {
        _super.prototype.onInit.call(this, pointer, id, slider);

        this.uid = id;
        this.parent = slider;
        this.value = {};
        this.settings = this.parent.settings;
    };

    SliderPointer.prototype.onMouseDown = function (event) {
        _super.prototype.onMouseDown.call(this, event);

        this._parent = {
            offset: this.parent.domNode.offset(),
            width: this.parent.domNode.width()
        };

        this.pointer.addDependClass('hover');

        this.setIndexOver();
    };

    SliderPointer.prototype.onMouseMove = function (event) {
        _super.prototype.onMouseMove.call(this, event);

        this._set(this.calc(this.getPageCoords(event).x));

        this.parent.setValueElementPosition();

        this.parent.redrawLabels(this);
    };

    SliderPointer.prototype.isMinDistanceViolation = function (minDistance, another) {
        return (this.value && another && another.value) && ((this.uid === Slider.POINTER_LEFT && this.value.origin + minDistance >= another.value.origin) || (this.uid === Slider.POINTER_RIGHT && this.value.origin - minDistance <= another.value.origin));
    };

    SliderPointer.prototype.onMouseUp = function (event) {
        _super.prototype.onMouseUp.call(this, event);

        var another = this.getAdjacentPointer(), minDistance = this.settings.minDistance;

        if (minDistance && another && this.isMinDistanceViolation(minDistance, another)) {
            this.parent.setValueElementPosition();
        }

        if (this.settings.callback && $.isFunction(this.settings.callback)) {
            this.settings.callback.call(this.parent, this.parent.getValue());
        }

        this.pointer.removeDependClass('hover');
    };

    SliderPointer.prototype.setIndexOver = function () {
        this.parent.setPointerIndex(1);
        this.index(2);
    };

    SliderPointer.prototype.index = function (i) {
        this.pointer.css({ zIndex: i });
    };

    SliderPointer.prototype.limits = function (x) {
        return this.parent.limits(x, this);
    };

    SliderPointer.prototype.calc = function (coords) {
        return this.limits(((coords - this._parent.offset.left) * 100) / this._parent.width);
    };

    SliderPointer.prototype.set = function (value, optOrigin) {
        if (typeof optOrigin === "undefined") { optOrigin = false; }
        this.value.origin = this.parent.round(value);

        this._set(this.parent.valueToPrc(value, this), optOrigin);
    };

    SliderPointer.prototype._set = function (prc, optOrigin) {
        if (typeof optOrigin === "undefined") { optOrigin = false; }
        if (!optOrigin) {
            this.value.origin = this.parent.prcToValue(prc);
        }

        var another = this.getAdjacentPointer(), minDistance = this.settings.minDistance;

        if (minDistance && another && this.isMinDistanceViolation(minDistance, another)) {
            switch (this.uid) {
                case Slider.POINTER_LEFT:
                    if (this.value.origin + minDistance >= another.value.origin) {
                        this.value.origin = another.value.origin - minDistance;
                    }
                    break;

                case Slider.POINTER_RIGHT:
                    if (this.value.origin - minDistance <= another.value.origin) {
                        this.value.origin = another.value.origin + minDistance;
                    }
                    break;
            }

            prc = this.parent.valueToPrc(this.value.origin, this);
        }

        this.value.prc = prc;
        this.pointer.css({ left: prc + '%' });
        this.parent.update();
    };

    SliderPointer.prototype.getAdjacentPointer = function () {
        return this.parent.o.pointers[1 - this.uid];
    };
    return SliderPointer;
})(SliderDraggable);
;
var Slider = (function () {
    function Slider() {
        var args = [];
        for (var _i = 0; _i < (arguments.length - 0); _i++) {
            args[_i] = arguments[_i + 0];
        }
        this.defaultOptions = {
            settings: {
                from: 1,
                to: 10,
                step: 1,
                smooth: true,
                limits: true,
                round: 0,
                format: { format: "#,##0.##" },
                value: "5;7",
                dimension: ""
            },
            className: "jslider",
            selector: ".jslider-",
            template: tmpl('<span class="<%=className%>">' + '<table><tr><td>' + '<div class="<%=className%>-bg">' + '<i class="l"></i><i class="f"></i><i class="r"></i>' + '<i class="v"></i>' + '</div>' + '<div class="<%=className%>-pointer"></div>' + '<div class="<%=className%>-pointer <%=className%>-pointer-to"></div>' + '<div class="<%=className%>-label"><span><%=settings.from%></span></div>' + '<div class="<%=className%>-label <%=className%>-label-to"><span><%=settings.to%></span><%=settings.dimension%></div>' + '<div class="<%=className%>-value"><span></span><%=settings.dimension%></div>' + '<div class="<%=className%>-value <%=className%>-value-to"><span></span><%=settings.dimension%></div>' + '<div class="<%=className%>-scale"><%=scale%></div>' + '</td></tr></table>' + '</span>')
        };
        this.is = {
            init: false
        };
        this.o = {};
        this.init.apply(this, args);
    }
    Slider.prototype.init = function (node, settings) {
        this.settings = $.extend(true, {}, this.defaultOptions.settings, settings);

        this.inputNode = $(node).hide();

        if (this.inputNode.prop('tagName') !== 'INPUT') {
            throw "jquery.slider: Slider must only be applied to INPUT elements.";
        }

        this.settings.interval = this.settings.to - this.settings.from;
        this.settings.value = this.inputNode.val();

        if (this.settings.value === null || this.settings.value === undefined) {
            throw "jquery.slider: INPUT element does not have a value.";
        }

        if (this.settings.calculate && $.isFunction(this.settings.calculate)) {
            this.nice = this.settings.calculate;
        }

        this.create();
    };

    Slider.prototype.create = function () {
        var _this = this;
        this.domNode = $(this.defaultOptions.template({
            className: this.defaultOptions.className,
            settings: {
                from: this.nice(this.settings.from),
                to: this.nice(this.settings.to),
                dimension: this.settings.dimension
            },
            scale: this.generateScale()
        }));

        this.inputNode.after(this.domNode);

        this.drawScale();

        if (this.settings.skin && this.settings.skin.length > 0) {
            this.setSkin(this.settings.skin);
        }

        this.sizes = {
            domWidth: this.domNode.width(),
            domOffset: this.domNode.offset()
        };

        $.extend(this.o, {
            pointers: [],
            labels: [
                {
                    o: this.domNode.find(this.defaultOptions.selector + 'value').not(this.defaultOptions.selector + 'value-to')
                },
                {
                    o: this.domNode.find(this.defaultOptions.selector + 'value').filter(this.defaultOptions.selector + 'value-to')
                }
            ],
            limits: [
                {
                    o: this.domNode.find(this.defaultOptions.selector + 'label').not(this.defaultOptions.selector + 'label-to')
                },
                {
                    o: this.domNode.find(this.defaultOptions.selector + 'label').filter(this.defaultOptions.selector + 'label-to')
                }
            ]
        });

        $.extend(this.o.labels[0], {
            value: this.o.labels[0].o.find('span')
        });

        $.extend(this.o.labels[1], {
            value: this.o.labels[1].o.find('span')
        });

        if (!this.settings.value.split(';')[1]) {
            this.settings.single = true;
            this.domNode.addDependClass('single');
        }

        if (!this.settings.limits) {
            this.domNode.addDependClass('limitless');
        }

        var values = this.settings.value.split(';');
        this.domNode.find(this.defaultOptions.selector + 'pointer').each(function (i, element) {
            var value = Number(values[i]);

            if (value) {
                _this.o.pointers[i] = new SliderPointer(element, i, _this);
                var prev = Number(values[i - 1]);

                if (prev && value < prev) {
                    value = prev;
                }

                value = (value < _this.settings.from) ? _this.settings.from : value;
                value = (value > _this.settings.to) ? _this.settings.to : value;

                _this.o.pointers[i].set(value, true);
            }
        });

        this.o.value = this.domNode.find('.v');
        this.is.init = true;

        $.each(this.o.pointers, function (i, pointer) {
            _this.redraw(pointer);
        });

        $(window).resize(function () {
            _this.onResize();
        });
    };

    Slider.prototype.onStateChange = function (value) {
        if ($.isFunction(this.settings.onStateChange)) {
            return this.settings.onStateChange.apply(this, value);
        }
        return true;
    };

    Slider.prototype.disableSlider = function () {
        this.domNode.addClass('disabled');
    };

    Slider.prototype.enableSlider = function () {
        this.domNode.removeClass('disabled');
    };

    Slider.prototype.update = function () {
        this.onResize();
        this.drawScale();
    };

    Slider.prototype.setSkin = function (skinName) {
        if (this.skin) {
            this.domNode.removeDependClass(this.skin, '_');
        } else {
            this.domNode.addDependClass(this.skin = skinName, "_");
        }
    };

    Slider.prototype.setPointerIndex = function (index) {
        $.each(this.getPointers(), function (i, pointer) {
            pointer.index(index);
        });
    };

    Slider.prototype.getPointers = function () {
        return this.o.pointers;
    };

    Slider.prototype.generateScale = function () {
        if (!this.settings.scale) {
            return '';
        }

        var str = '', scale = this.settings.scale, prc = Math.min(Math.max(0, Math.round((100 / (scale.length - 1)) * 10000) / 10000), 100);

        for (var i = 0; i < scale.length; i++) {
            str += '<span style="left: ' + i * prc + '%">' + (scale[i] != '|' ? '<ins>' + scale[i] + '</ins>' : '') + '</span>';
        }

        return str;
    };

    Slider.prototype.drawScale = function () {
        this.domNode.find(this.defaultOptions.selector + 'scale span ins').each(function () {
            $(this).css({ marginLeft: -$(this).outerWidth() / 2 });
        });
    };

    Slider.prototype.onResize = function () {
        var _this = this;
        this.sizes = {
            domWidth: this.domNode.width(),
            domOffset: this.domNode.offset()
        };

        $.each(this.o.pointers, function (i, pointer) {
            _this.redraw(pointer);
        });
    };

    Slider.prototype.limits = function (x, pointer) {
        if (!this.settings.smooth) {
            var step = this.settings.step * 100 / (this.settings.interval);
            x = Math.round(x / step) * step;
        }

        var another = this.o.pointers[1 - pointer.uid];
        if (another && pointer.uid && x < another.value.prc) {
            x = another.value.prc;
        }

        if (another && !pointer.uid && x > another.value.prc) {
            x = another.value.prc;
        }

        if (x < 0) {
            x = 0;
        }

        if (x > 100) {
            x = 100;
        }

        return Math.round(x * 10) / 10;
    };

    Slider.prototype.redraw = function (pointer) {
        if (!this.is.init) {
            return;
        }

        if (this.settings.minDistance && this.shouldPreventPositionUpdate(pointer)) {
            return;
        }

        this.setValue();

        this.setValueElementPosition();

        this.redrawLabels(pointer);
    };

    Slider.prototype.setValueElementPosition = function () {
        if (this.o.pointers.length == 2) {
            var cssProps = {
                left: this.o.pointers[0].value.prc + '%',
                width: (this.o.pointers[1].value.prc - this.o.pointers[0].value.prc) + '%'
            };
            this.o.value.css(cssProps);
        }
    };

    Slider.prototype.shouldPreventPositionUpdate = function (pointer) {
        var another = this.o.pointers[1 - pointer.uid];

        if (!another) {
            return false;
        }

        switch (pointer.uid) {
            case Slider.POINTER_LEFT:
                if ((pointer.value.origin + this.settings.minDistance) == another.value.origin) {
                    return true;
                }
                break;

            case Slider.POINTER_RIGHT:
                if ((pointer.value.origin - this.settings.minDistance) == another.value.origin) {
                    return true;
                }
                break;
        }

        return false;
    };

    Slider.prototype.redrawLabels = function (pointer) {
        this.o.labels[pointer.uid].value.html(this.nice(pointer.value.origin));

        var label = this.o.labels[pointer.uid], prc = pointer.value.prc, sizes = {
            label: label.o.outerWidth(),
            right: false,
            border: (prc * this.sizes.domWidth) / 100
        };

        if (!this.settings.single) {
            var another = this.o.pointers[1 - pointer.uid], anotherLabel = this.o.labels[another.uid];

            switch (pointer.uid) {
                case 0:
                    if (sizes.border + sizes.label / 2 > (anotherLabel.o.offset().left - this.sizes.domOffset.left)) {
                        anotherLabel.o.css({ visibility: "hidden" });
                        anotherLabel.value.html(this.nice(another.value.origin));

                        label.o.css({ visibility: "visible" });

                        prc = (another.value.prc - prc) / 2 + prc;

                        if (another.value.prc != pointer.value.prc) {
                            label.value.html(this.nice(pointer.value.origin) + '&nbsp;&ndash;&nbsp;' + this.nice(another.value.origin));

                            sizes.label = label.o.outerWidth();
                            sizes.border = (prc * this.sizes.domWidth) / 100;
                        }
                    } else {
                        anotherLabel.o.css({ visibility: 'visible' });
                    }
                    break;

                case 1:
                    if (sizes.border - sizes.label / 2 < (anotherLabel.o.offset().left - this.sizes.domOffset.left) + anotherLabel.o.outerWidth()) {
                        anotherLabel.o.css({ visibility: 'hidden' });
                        anotherLabel.value.html(this.nice(another.value.origin));

                        label.o.css({ visibility: 'visible' });

                        prc = (prc - another.value.prc) / 2 + another.value.prc;

                        if (another.value.prc != pointer.value.prc) {
                            label.value.html(this.nice(another.value.origin) + "&nbsp;&ndash;&nbsp;" + this.nice(pointer.value.origin));

                            sizes.label = label.o.outerWidth();
                            sizes.border = (prc * this.sizes.domWidth) / 100;
                        }
                    } else {
                        anotherLabel.o.css({ visibility: 'visible' });
                    }
                    break;
            }
        }

        this.setPosition(label, sizes, prc);

        if (anotherLabel) {
            sizes = {
                label: anotherLabel.o.outerWidth(),
                right: false,
                border: (another.value.prc * this.sizes.domWidth) / 100
            };

            this.setPosition(anotherLabel, sizes, another.value.prc);
        }

        this.redrawLimits();
    };

    Slider.prototype.redrawLimits = function () {
        if (this.settings.limits) {
            var limits = [true, true];

            for (var key in this.o.pointers) {
                if (!this.settings.single || key == 0) {
                    var pointer = this.o.pointers[key], label = this.o.labels[pointer.uid], labelLeft = label.o.offset().left - this.sizes.domOffset.left;

                    if (labelLeft < this.o.limits[0].o.outerWidth()) {
                        limits[0] = false;
                    }

                    if (labelLeft + label.o.outerWidth() > this.sizes.domWidth - this.o.limits[1].o.outerWidth()) {
                        limits[1] = false;
                    }
                }
            }

            for (var i = 0; i < limits.length; i++) {
                if (limits[i]) {
                    this.o.limits[i].o.fadeIn('fast');
                } else {
                    this.o.limits[i].o.fadeOut('fast');
                }
            }
        }
    };

    Slider.prototype.setPosition = function (label, sizes, prc) {
        sizes.margin = -sizes.label / 2;

        var labelLeft = sizes.border + sizes.margin;
        if (labelLeft < 0) {
            sizes.margin -= labelLeft;
        }

        if (sizes.border + sizes.label / 2 > this.sizes.domWidth) {
            sizes.margin = 0;
            sizes.right = true;
        } else {
            sizes.right = false;
        }

        var cssProps = {
            left: prc + '%',
            marginLeft: sizes.margin,
            right: 'auto'
        };

        label.o.css(cssProps);

        if (sizes.right) {
            label.o.css({ left: "auto", right: 0 });
        }

        return sizes;
    };

    Slider.prototype.setValue = function () {
        var value = this.getValue();

        this.inputNode.val(value);

        this.onStateChange(value);
    };

    Slider.prototype.getValue = function () {
        var _this = this;
        if (!this.is.init) {
            return false;
        }

        var value = '';

        $.each(this.o.pointers, function (i, pointer) {
            if (pointer.value.prc != undefined && !isNaN(pointer.value.prc)) {
                value += (i > 0 ? ';' : '') + _this.prcToValue(pointer.value.prc);
            }
        });

        return value;
    };

    Slider.prototype.getPrcValue = function () {
        if (!this.is.init) {
            return false;
        }

        var value = '';
        $.each(this.o.pointers, function (i, pointer) {
            if (pointer.value.prc != undefined && !isNaN(pointer.value.prc)) {
                value += (i > 0 ? ';' : '') + pointer.value.prc;
            }
        });

        return value;
    };

    Slider.prototype.prcToValue = function (prc) {
        if (this.settings.hetrogeneity && this.settings.hetrogeneity.length > 0) {
            var heterogeneity = this.settings.hetrogeneity, start = 0, from = this.settings.from, value;

            for (var i = 0; i <= heterogeneity.length; i++) {
                var v;
                if (heterogeneity[i]) {
                    v = heterogeneity[i].split('/');
                } else {
                    v = [100, this.settings.to];
                }

                v[0] = Number(v[0]);
                v[1] = Number(v[1]);

                if (prc >= start && prc <= v[0]) {
                    value = from + ((prc - start) * (v[1] - from)) / (v[0] - start);
                }

                start = v[0];
                from = v[1];
            }
        } else {
            value = this.settings.from + (prc * this.settings.interval) / 100;
        }

        return this.round(value);
    };

    Slider.prototype.valueToPrc = function (value, pointer) {
        var prc;
        if (this.settings.hetrogeneity && this.settings.hetrogeneity.length > 0) {
            var hetrogeneity = this.settings.hetrogeneity, start = 0, from = this.settings.from, v;

            for (var i = 0; i <= hetrogeneity.length; i++) {
                if (hetrogeneity[i]) {
                    v = hetrogeneity[i].split('/');
                } else {
                    v = [100, this.settings.to];
                }

                v[0] = Number(v[0]);
                v[1] = Number(v[1]);

                if (value >= from && value <= v[1]) {
                    prc = pointer.limits(start + (value - from) * (v[0] - start) / (v[1] - from));
                }

                start = v[0];
                from = v[1];
            }
        } else {
            prc = pointer.limits((value - this.settings.from) * 100 / this.settings.interval);
        }

        return prc;
    };

    Slider.prototype.round = function (value) {
        value = Math.round(value / this.settings.step) * this.settings.step;

        if (this.settings.round) {
            value = Math.round(value * Math.pow(10, this.settings.round)) / Math.pow(10, this.settings.round);
        } else {
            value = Math.round(value);
        }

        return value;
    };

    Slider.prototype.nice = function (value) {
        value = value.toString().replace(/,/gi, ".").replace(/ /gi, "");

        if ($.formatNumber) {
            return $.formatNumber(Number(value), this.settings.format || {}).replace(/-/gi, "&minus;");
        }

        return Number(value);
    };

    Slider.prototype.destroy = function () {
        $.each(this.o.pointers, function (i, sliderPointer) {
            sliderPointer.destroy();
        });

        $.each(this.o.labels, function (i, element) {
            element.remove();
        });

        $.each(this.o.limits, function (i, element) {
            element.remove();
        });

        this.o.value.remove();

        this.domNode.remove();
    };
    Slider.POINTER_LEFT = 0;
    Slider.POINTER_RIGHT = 1;
    return Slider;
})();
;$.slider = function (node, settings, force) {
    if (typeof force === "undefined") { force = false; }
    var jNode = $(node);
    if (!jNode.data("jslider")) {
        jNode.data("jslider", new Slider(node, settings));
    }

    return jNode.data("jslider");
};

$.fn.slider = function (action, optValue) {
    var returnValue, args = arguments;

    function isDef(val) {
        return val !== undefined;
    }

    function isDefAndNotNull(val) {
        return val != null;
    }

    this.each(function () {
        var self = $.slider(this, action, optValue);

        if (typeof action == "string") {
            switch (action) {
                case "value":
                    if (isDef(args[1]) && isDef(args[2])) {
                        var pointers = self.getPointers();
                        if (isDefAndNotNull(pointers[0]) && isDefAndNotNull(args[1])) {
                            pointers[0].set(args[1]);
                            pointers[0].setIndexOver();
                        }

                        if (isDefAndNotNull(pointers[1]) && isDefAndNotNull(args[2])) {
                            pointers[1].set(args[2]);
                            pointers[1].setIndexOver();
                        }
                    } else if (isDef(args[1])) {
                        var pointers = self.getPointers();
                        if (isDefAndNotNull(pointers[0]) && isDefAndNotNull(args[1])) {
                            pointers[0].set(args[1]);
                            pointers[0].setIndexOver();
                        }
                    } else
                        returnValue = self.getValue();

                    break;

                case "prc":
                    if (isDef(args[1]) && isDef(args[2])) {
                        var pointers = self.getPointers();
                        if (isDefAndNotNull(pointers[0]) && isDefAndNotNull(args[1])) {
                            pointers[0]._set(args[1]);
                            pointers[0].setIndexOver();
                        }

                        if (isDefAndNotNull(pointers[1]) && isDefAndNotNull(args[2])) {
                            pointers[1]._set(args[2]);
                            pointers[1].setIndexOver();
                        }
                    } else if (isDef(args[1])) {
                        var pointers = self.getPointers();
                        if (isDefAndNotNull(pointers[0]) && isDefAndNotNull(args[1])) {
                            pointers[0]._set(args[1]);
                            pointers[0].setIndexOver();
                        }
                    } else
                        returnValue = self.getPrcValue();

                    break;

                case "calculatedValue":
                    var value = self.getValue().split(";");
                    returnValue = '';
                    for (var i = 0; i < value.length; i++) {
                        returnValue += (i > 0 ? ";" : "") + self.nice(value[i]);
                    }
                    break;

                case "disable":
                    self.disableSlider();
                    break;

                case "enable":
                    self.enableSlider();
                    break;

                case "skin":
                    self.setSkin(args[1]);
                    break;
            }
        } else if (!action && !optValue) {
            if (!$.isArray(returnValue)) {
                returnValue = [];
            }

            returnValue.push(self);
        }
    });

    if ($.isArray(returnValue) && returnValue.length == 1) {
        returnValue = returnValue[0];
    }

    return returnValue || this;
};
