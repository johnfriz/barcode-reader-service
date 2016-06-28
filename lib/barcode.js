var express = require('express');
var bodyParser = require('body-parser');
var request = require('request')
var winston = require('winston');
var jsdom = require('jsdom');
var cors = require('cors');
var soap = require('soap');
var csv = require('csv');

var accessToken = process.env.ACCESS_TOKEN || '924646BB-A268-4007-9D87-2CE3084B47BC';

// Add timestamps to log statements
var logger = new (winston.Logger)({
    transports: [
      new (winston.transports.Console)({'timestamp': function() { return (new Date()); }})
    ]
});

function barcodeRoute() {
  var barcode = new express.Router();
  barcode.use(cors());
  barcode.use(bodyParser());

  barcode.get('/recent', function(req, res) {
    logger.info('************************');
    logger.info('/barcode/recent');

    // Request the searchupc.com home page. It contains a list of current searches.
    request({
      url : 'http://www.searchupc.com/',
      method : 'get',
      followAllRedirects : true
    }, function(err, response, body){

      logger.debug('Res Status Code = ',  response.statusCode);
      if (err || response.statusCode != 200) {
        logger.warn('Error calling searchupc.com - Error = ', err, " - body = ", body);
        return res.status(500).send({"error":"Unable to reach searchupc.com", "body":body});
      }

      // Add jQuery to the response so we can easily access elements in the page
      try {
        jsdom.env(body,["http://code.jquery.com/jquery.js"], function (errors, window) {
          var $ = window.$;
          var currentSearches = [];

          // The span with id 'currentsearches' contains a list of <a> tags which have the current searches
          $('#currentsearches').children('a').each(function () {
            // Iterate over each child element of type <a> and store the value in the currentSearches array
            currentSearches.push(this.innerHTML)
          });
          logger.info('current searches = ' + currentSearches);
          return res.json(currentSearches);
        });
      } catch (e) {
        logger.info('No Response from searchupc.com SOAP Service');
        return res.json({'error':'Unable to parse response from searchupc.com for barcode', 'code':'NO-BARCODE'})
      }
    });
  });

  barcode.all('/read', function(req, res) {
    logger.info('************************');
    var barcode = req.query.barcode || req.body.barcode;
    logger.info('/barcode/read - barcode = ', barcode);

    var wsdlUrl = 'http://www.searchupc.com/service/UPCSearch.asmx?wsdl';
    // this will lookup the WSDL, and create a client with functions for every exposed endpoint
    soap.createClient(wsdlUrl, function(err, soapClient){
      if (err) {
        logger.warn('Error calling searchupc.com SOAP Service - Error = ', err);
        return res.status(500).send({"error":"Unable to reach searchupc.com SOAP Service", "err":err});
      }
      // one of these exposed entpoints was called GetProduct
      soapClient.GetProduct({
        upc : barcode,
        accesstoken : accessToken
      }, function(err, result){
        logger.info(result);
        if (err) {
          logger.warn('Error calling searchupc.com SOAP Service - Error = ', err);
          return res.status(500).send({"error":"Unable to reach searchupc.com SOAP Service", "err":err});
        }        // now we have the response, but the webservice returns it as a CSV string. Let's use the parser
        var responseAsCsv = result.GetProductResult;
        if(JSON.stringify(responseAsCsv) != '{}') {
          csv.parse(responseAsCsv, {columns : true}, function(err, parsedResponse){
            if (err) {
              logger.warn('Error parsing csv response from searchupc.com SOAP Service - Error = ', err);
              return res.status(500).send({"error":"Unable to parsing csv response from searchupc.com SOAP Service", "err":err});
            }          // finally, we're ready to return this back to the client.
            logger.info('Parsed Response from searchupc.com SOAP Service - ', parsedResponse);
            return res.json(parsedResponse);
          });
        } else {
          logger.info('No Response from searchupc.com SOAP Service');
          return res.json({'error':'No response from searchupc.com for barcode', 'code':'NO-BARCODE'})
        }
      });

    });
  });

  return barcode;
}

module.exports = barcodeRoute;
