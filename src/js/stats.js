"use strict";

var stats = (function(kpretty, round) {
	var times = [];
	var div = $('<div id="stats" />');
	var stext = $('<textarea rows="10" readonly />');
	var scrollDiv = $('<div class="myscroll" />');
	var newSessionOption = $('<option />').val('new').html('New..');
	var delSessionOption = $('<option />').val('del').html('Delete..');

	var table = $('<table />').click(procClick).addClass("table");
	var title = $('<tr />');

	var avgRow = $('<tr class="times" />');
	var showAllRow = $('<tr class="click" ><th class="click" colspan="15">...</th></tr>');

	var sumtable = $('<table class="sumtable" />').click(infoClick).addClass("table");

	var sessionIdxMax = 15;
	var sessionIdxMin = 1;

	var MAX_ITEMS = 100;

	var select = $('<select />').change(function() {
		kernel.blur();
		if (sessionIdx != -1) {
			localStorage['session' + sessionIdx] = JSON.stringify(times);
		}
		if (select.val() == 'new') {
			sessionIdx = sessionIdxMax + 1;
			sessionIdxMax++;
			var curDate = new Date();
			var newName = (curDate.getMonth() + 1) + "." + curDate.getDate() + ' ' + curScrType;
			newSessionOption.before($('<option />').val(sessionIdx).html(newName))
			select.val(sessionIdx);
			kernel.setProp('sessionN', sessionIdxMax);

			var sessionName = JSON.parse(kernel.getProp('sessionName'));
			sessionName[sessionIdx] = newName;
			kernel.setProp('sessionName', JSON.stringify(sessionName));

			var sessionScr = JSON.parse(kernel.getProp('sessionScr'));
			sessionScr[sessionIdx] = curScrType;
			kernel.setProp('sessionScr', JSON.stringify(sessionScr));

			if (kernel.getProp('imrename')) {
				renameSession();
			}
		} else if (select.val() == 'del') {
			if (!deleteSession()) {
				select.val(sessionIdx);
			}
			return;
		} else {
			sessionIdx = ~~select.val();
		}
		kernel.setProp('session', sessionIdx);
		var timeStr = localStorage['session' + sessionIdx];
		if (timeStr != undefined && timeStr != '') {
			times = JSON.parse(timeStr);
		} else {
			times = [];
		}
		if (kernel.getProp('ss2scr')) {
			var sessionScr = JSON.parse(kernel.getProp('sessionScr'));
			sessionScr[sessionIdx] = sessionScr[sessionIdx] || curScrType;
			kernel.setProp('sessionScr', JSON.stringify(sessionScr));
			kernel.setProp('scrType', sessionScr[sessionIdx]);
		}
		updateTable(false);
	});

	var sessionIdx = 1;

	function genSelect() {
		select.empty();
		var curNameList = JSON.parse(kernel.getProp('sessionName'));
		for (var i=1; i<=sessionIdxMax; i++) {
			if (curNameList[i] == undefined) {
				curNameList[i] = i;
			}
			select.append($('<option />').val(i).html(curNameList[i]));
		}
		select.append(newSessionOption, delSessionOption);
		select.val(sessionIdx);
	}

	function push(time) {
        var now = new Date();
        if (typeof time[0] == "string") {
			times.push([time[2], time[1] || scramble, time[0], now]);
			time = time[2];
		} else {
			times.push([time, scramble, "", now]);
		}
		save();
		if (time.length-1 > curDim) {
			updateTable(true);
		} else {
			avgRow.before( getTimeRow(times.length-1, curDim) );
			updateAvgRow(curDim);
			if (times.length > MAX_ITEMS) {
				showAllRow.next().remove();
				hideAll();
			}
			scrollDiv.scrollTop(table[0].scrollHeight);
		}
		updateUtil();
	}

	function deleteSession() {
		if (!confirm(STATS_CFM_DELSS)) {
			return false;
		}
		var sessionName = JSON.parse(kernel.getProp('sessionName'));
		var sessionScr = JSON.parse(kernel.getProp('sessionScr'));
		for (var i=sessionIdx; i<sessionIdxMax; i++) {
			localStorage['session' + i] = localStorage['session' + (i + 1)] || '[]';
			sessionName[i] = sessionName[i+1];
			sessionScr[i] = sessionScr[i+1];
		}
		delete localStorage['session' + sessionIdxMax];
		delete sessionName[sessionIdxMax];
		delete sessionScr[sessionIdxMax];
		var prevIdx = sessionIdx;
		sessionIdx = -1;
		sessionIdxMax--;
		kernel.setProp('sessionN', sessionIdxMax);
		kernel.setProp('sessionName', JSON.stringify(sessionName));
		kernel.setProp('sessionScr', JSON.stringify(sessionScr));
		if (sessionIdxMax == 0) {
			select.val('new');
			select.change();
		} else {
			if (prevIdx > sessionIdxMax) {
				kernel.setProp('session', sessionIdxMax);
			} else {
				select.val(prevIdx);
				select.change();
			}
		}
		return true;
	}

	function reset() {
		if (!confirm(STATS_CFM_RESET)) {
			return;
		}
		times = [];
		save();
		updateTable(false);
		kernel.blur();
	}

	function delIdx(index) {
		var n_del;
		if (kernel.getProp("delmul")) {
			n_del = prompt(STATS_CFM_DELMUL, 1);
			if (n_del == null || !/^\d+$/.exec(n_del) || ~~n_del == 0) {
				return;
			}
		} else {
			if (!confirm(STATS_CFM_DELETE)) {
				return;
			}
			n_del = 1;
		}
		times.splice(index, ~~n_del);
		save();
		updateTable(false);
		return true;
	}

	function getMean(dim) {
		var sum = 0;
		var cntdnf = 0;
		for (var i=0; i<times.length; i++) {
			var curTime = times[i][0];
			if (curTime[0] == -1 || curTime.length <= dim) {
				cntdnf += 1;
			} else if (dim == 0) {
				sum += timesAt(i);
			} else if (dim == 1) {
				sum += curTime[curTime.length-dim];
			} else {
				sum += curTime[curTime.length-dim] - curTime[curTime.length-dim+1];
			}
		}
		if (cntdnf == times.length) {
			return -1;
		} else {
			return sum / (times.length - cntdnf);
		}
	}

	/**
	* return [best, avg, mean, avgExceptDNF, cntDNF], -1 == unknown or DNF
	*/
	function getBestAvgIdx(idx, len) {
		if (!(idx >= 0 && idx + len <= times.length)) {
			return;
		} else if (len == 0) {
			return [-1, -1, -1, -1, 0];
		}
		var total = 0;
		var best = 0x7fffffff;
		var worst = 0;
		var cntDNF = 0;
		var trim = Math.ceil(len/20);
		var time_list = new Array(len);
		for (var i=idx; i<idx+len; i++) {
			if (times[i][0][0] == -1) {
				cntDNF++;
				time_list[i-idx] = -1;
			} else {
				var time = timesAt(i);
				best = Math.min(best, time);
				worst = Math.max(worst, time);
				total += time;
				time_list[i-idx] = time;
			}
		}
		time_list.sort(dnfsort);
		var totaltrim = 0;
		for (var i=trim; i<len - trim; i++) {
			totaltrim += time_list[i];
		}
		if (cntDNF == len) {
			return [-1, -1, -1, -1, cntDNF];
		} else if (cntDNF > trim) {
			return [best, -1, -1, round(total/(len - cntDNF)), cntDNF];
		} else if (cntDNF <= trim && cntDNF != 0) {
			return [best, round(totaltrim / (len - 2 * trim)), -1, round(total/(len - cntDNF)), cntDNF];
		} else {
			return [best, round(totaltrim / (len - 2 * trim)), round(total/len), round(total/len), cntDNF];
		}
	}

	function pretty(time, showDNF) {
		switch (time[0]) {
		case 0: return kpretty(time[1]);
		case -1: return "DNF" + (showDNF ? ("(" + kpretty(time[1]) + ")") : "");
		default: return kpretty(time[0] + time[1]) + "+";
		}
	}

	var floatCfm = (function() {
		var floatDiv = $('<div />').addClass('popup').mouseleave(hideFloat);
		var cfmTime = $('<span style="font-size:1.2em"/>');
		var cfmOKR = $('<span class="click">').html("OK").click(procClk);
		var cfmP2R = $('<span class="click">').html("+2").click(procClk);
		var cfmDNFR = $('<span class="click">').html("DNF").click(procClk);
		var cfmTxtR = $('<input type="text">').css('width', '8em').change(procTxt);
		var cfmDelR = $('<input type="button">').val("X").click(procClk);
		var cfmIdx;
		var cfmIdxRow;

		var hideId;

		var button2time = {"OK": 0, "+2": 2000, "DNF": -1};

		function hideFloat() {
			if (cfmIdx != undefined && hideId == undefined) {
				procTxt();
			}
			if (hideId != undefined) {
				floatDiv.hide();
				hideId = undefined;
			} else {
				hideId = setTimeout(hideFloat, 100);
			}
		}

		function procTxt() {
			times[cfmIdx][2] = cfmTxtR.val();
			save();
			getTimeRow(cfmIdx, curDim, cfmIdxRow);
		}

		function procClk(selected) {
			if (!$.isNumeric(selected)) {
				var value = $(this).val();
				if (value == 'X') {
					if (delIdx(cfmIdx)) {
						cfmIdx = undefined;
						hideFloat();
					}
					return;
				}
				selected = button2time[$(this).html()];
			}
			if (times[cfmIdx][0][0] != selected) {
				times[cfmIdx][0][0] = selected;
				save();
				updateFrom(cfmIdx, cfmIdxRow);
				updateUtil();
			}
			getTimeRow(cfmIdx, curDim, cfmIdxRow);
			cfmTime.html(pretty(times[cfmIdx][0], true));
		}

		function procMouse(e) {
			var target = $(e.target)
			var prev = target.prevAll();
			var row = prev.length;
			var idx = ~~(row == 0 ? target : prev.eq(-1)).html().replace("*", "") - 1;
			if (row > 1 || !target.is('td')) {
				cfmIdx = undefined;
				hideFloat();
				return;
			}
			if (row == 0) {
				target = target.next();
			}
			cfmIdx = idx;
			cfmIdxRow = target.parent();
			var position = target.offset();
			position.left += target.outerWidth();
			position.top -= 30;
			cfmTime.html(pretty(times[idx][0], true));
			cfmTxtR.val(times[idx][2]);
			switch (times[cfmIdx][0][0]) {
				case 0: cfmOKR.prop("checked", true); break;
				case 2000: cfmP2R.prop("checked", true); break;
				case -1: cfmDNFR.prop("checked", true); break;
			}
			hideId && clearTimeout(hideId);
			hideId = undefined;
			floatDiv.show().offset(position);
		}

		$(function() {
			scrollDiv.mouseover( procMouse );
			floatDiv.appendTo('body').append(cfmTime, " ", cfmDelR, "<br>",  cfmOKR, " | ", cfmP2R, " | ", cfmDNFR, "<br>" + STATS_COMMENT, cfmTxtR);
		});

		return {
			setCfm: function(value) {
				if (times.length == 0) {
					return;
				}
				hideFloat();
				cfmIdx = times.length - 1;
				cfmIdxRow = avgRow.prev();
				procClk(value);
				cfmIdx = undefined;
			}, 
			hide: hideFloat
		}
	})();

	function showAll(e) {
		var rows = [];
		for (var i=0, len = Math.max(0, times.length - MAX_ITEMS); i<len; i++) {
			rows.push(getTimeRow(i, curDim));
		}
		showAllRow.before(rows.join(""));
		showAllRow.hide();
	}

	function hideAll() {
		while (true) {
			var row = showAllRow.prev();
			if (row[0] == title[0]) {
				break;
			};
			row.remove();
		}
		if (times.length > MAX_ITEMS) {
			showAllRow.show();
		}
	}

	function updateFrom(idx, idxRow) {
		for (var i=idx+1; i<idx+Math.max(len1, len2) && i<times.length; i++) {
			idxRow = idxRow.next();
			getTimeRow(i, curDim, idxRow);
		}
		updateAvgRow(curDim);
	}

	var curDim = 0;

	function procClick(e) {
		var target = $(e.target);
		if (!target.is('td') || target.html() == '-') {
			return;
		}
		var prev = target.prevAll();
		var row = prev.length;
		var idx = ~~(row == 0 ? target : prev.eq(-1)).html().replace("*", "") - 1;
		if (row > 4 || row < 0) {
			return;
		}
		switch (row) {
		case 0: setHighlight(idx, 1, 10, true); floatCfm.hide(); break;
		case 1: break;
		case 2: setHighlight(idx - len1 + 1, len1, len1 * 10, stat1 < 0); break;
		case 3: setHighlight(idx - len2 + 1, len2, len2 * 10, stat2 < 0); break;
		}
	}

	function getAvgSignal(i) {
		var st1 = getBestAvgIdx(i - len1 + 1, len1);
		var st2 = getBestAvgIdx(i - len2 + 1, len2);
		kernel.pushSignal('avg',
			[
				(stat1 > 0 ? 'ao' : 'mo') + len1 + ": " + (st1 ? kpretty(st1[stat1 > 0 ? 1 : 2]) : "-"),
				(stat2 > 0 ? 'ao' : 'mo') + len2 + ": " + (st2 ? kpretty(st2[stat2 > 0 ? 1 : 2]) : "-"),
				st1 ? [i - len1 + 1, len1, len1 * 10, stat1 < 0] : undefined,
				st2 ? [i - len2 + 1, len2, len2 * 10, stat2 < 0] : undefined,
				setHighlight
			]
		);
	}

	function getTimeRow(i, dim, tr) {
		var curTime = times[i][0];

		var ret = [];

		ret.push(
			'<td class="times">' + (times[i][2] && "*") + (i+1) + '</td>' +
			'<td class="times">' + pretty(curTime, false) + '</td>'
		);

		var st1 = getBestAvgIdx(i - len1 + 1, len1);
		var st2 = getBestAvgIdx(i - len2 + 1, len2);
		ret.push(
			'<td' + (st1 ? ' class="times"' : "") + '>' + (st1 ? kpretty(st1[stat1 > 0 ? 1 : 2]) : "-") + '</td>' +
			'<td' + (st2 ? ' class="times"' : "") + '>' + (st2 ? kpretty(st2[stat2 > 0 ? 1 : 2]) : "-") + '</td>'
		);
		if (dim > 1) {
			ret.push('<td>' + kpretty(curTime[curTime.length-1]) + '</td>');
			for (var j=curTime.length-2; j>=1; j--) {
				ret.push('<td>' + kpretty(curTime[j] - curTime[j+1]) + '</td>');
			}
			for (var j=curTime.length-1; j<dim; j++) {
				ret.push('<td>-</td>');
			}
		}
		ret = ret.join("");
		tr && tr.html(ret);
		return '<tr>' + ret + '</tr>';
	}

	function updateAvgRow(dim) {
		avgRow.empty().unbind("click").click(getStats);
		var len = times.length;
		var data = getBestAvgIdx(0, len);
		kernel.pushSignal('stats', [data, len]);
		avgRow.append('<th colspan="4">' + STATS_SOLVE + ': ' + (len - data[4]) + '/' + len + '<br>'
			 + STATS_AVG + ': ' + kpretty(data[3]) + '</th>').css('font-size', '1.2em')
		if (dim > 1) {
			for (var j=1; j<=dim; j++) {
				avgRow.append('<th>' + kpretty(getMean(j)) + '</th>').css('font-size', '');
			}
		}

	}

	function updateTable(scroll) {
		var dim = 1;
		for (var i=0; i<times.length; i++) {
			dim = Math.max(dim, times[i][0].length - 1);
		}
		title.empty().append(
			'<th></th><th>' + STATS_TIME + '</th><th>' + (stat1 > 0 ? 'ao' : 'mo') + len1 + '</th><th>' + (stat2 > 0 ? 'ao' : 'mo') + len2 + '</th>'
		);
		if (dim > 1) {
			for (var i=0; i<dim; i++) {
				title.append('<th>P.' + (i+1) + '</th>');
			}
		}
		table.empty().append(title, showAllRow);
		showAllRow.unbind('click').click(showAll);
		if (times.length > MAX_ITEMS) {
			showAllRow.show();
		} else {
			showAllRow.hide();
		}
		updateAvgRow(dim);
		var rows = [];
		for (var i=Math.max(0, times.length - MAX_ITEMS), len=times.length; i<len; i++) {
			rows.push(getTimeRow(i, dim));
		}
		table.append(rows.join(""), avgRow);
		if (scroll) {
			scrollDiv.scrollTop(table[0].scrollHeight);
		}
		curDim = dim;
		updateUtil();
	}

	function updateSumTable() {
		if (!kernel.getProp('statsum')) {
			sumtable.empty();
			resultsHeight();
			return;
		}
		var theStats = getAllStats();
		var s = [];
		s.push('<tr><th></th><th>' + hlstr[1] + '</th><th>' + hlstr[0] + '</th></tr>');
		s.push('<tr><th>time</th>');
		if (times.length > 0) {
			var idx = times.length - 1;
			s.push('<td class="times click" data="cs">' + kpretty(timesAt(idx)) + '</td>');
			s.push('<td class="times click" data="bs">' + kpretty(bestTime) + '</td></tr>');
		} else {
			s.push('<td><span>-</span></td>');
			s.push('<td><span>-</span></td></tr>');
		}
		if (times.length >= moSize) {
			s.push('<tr><th>mo' + moSize + '</th>');
			s.push('<td class="times click" data="cm">' + kpretty(lastMo[0]) + '</td>');
			s.push('<td class="times click" data="bm">' + kpretty(bestMo[0]) + '</td></tr>');
		}
		for (var j = 0; j < avgSizes.length; j++) {
			if (times.length >= avgSizes[j]) {
				s.push('<tr><th>ao' + avgSizes[j] + '</th>');
				s.push('<td class="times click" data="ca' + j + '">' + kpretty(lastAvg[j][0]) + '</td>');
				s.push('<td class="times click" data="ba' + j + '">' + kpretty(bestAvg[j][0]) + '</td></tr>');
			}
		}
		s = s.join("");
		sumtable.html(s);
		resultsHeight();
	}

	function updateUtil() {
		updateSumTable();
		assistant.update();
		distribution.update();
		trend.update();
		getAvgSignal(times.length-1);
	}

	var avgSizes = [5,12,50,100,1000];
	var moSize = 3;
	var bestAvg = [[-1,0],[-1,0],[-1,0],[-1,0],[-1,0]];
	var lastAvg = [[-1,0],[-1,0],[-1,0],[-1,0],[-1,0]];
	var bestMo = [-1,0];
	var lastMo = [-1,0];
	var bestAvgIndex = [0,0,0,0,0];
	var bestMoIndex = 0;
	var bestTime = -1;
	var bestTimeIndex = 0;
	var worstTime = -1;
	var worstTimeIndex = 0;

	function setHighlight(start, nsolves, id, mean) {
		if (times.length == 0) return;
		var data = [0,[null],[null]];
		if (start + nsolves != 0) {
			if (mean) {
				data = runAvgMean(start, nsolves, 0, 0);
			} else {
				data = runAvgMean(start, nsolves);
			}
		}

		var now = new Date();
		var s = [hlstr[3]
			.replace("%Y", now.getFullYear())
			.replace("%M", now.getMonth()+1)
			.replace("%D", now.getDate()) + "\n"];
		if (id > 1) {
			if (id==2) {
				s.push(hlstr[8]);//"Session average";
			} else if (id == 10) {
				s.push(hlstr[5]);
			} else if (mean) {
				s.push(hlstr[6].replace("%mk", ~~(id/10)));//"Mean of "+~~(id/10);
			} else {
				s.push(hlstr[7].replace("%mk", ~~(id/10)));//"Average of "+~~(id/10);
			}
			s.push(": " + kpretty(data[0]));
		}

		s.push("\n\n" + hlstr[10] + "\n");
		for (var i=0; i<nsolves; i++) {
			var time = times[start+i][0];
			if (kernel.getProp('printScr')) {
				s.push((i+1) + ". ");
			}
			if ($.inArray(i, data[2])>-1 || $.inArray(i, data[3])>-1) s.push("(");
			s.push(pretty(time, true));
			s.push((times[start+i][2] ? "[" + times[start+i][2] + "]" : ""));
			if ($.inArray(i, data[2])>-1 || $.inArray(i, data[3])>-1) s.push(")");
			if (kernel.getProp('printScr')) {
				s.push("   " + times[start+i][1] + " \n");
			} else {
				s.push(", ");
			}
		}
		s = s.join("");
		s = s.substr(0, s.length - 2);
		stext.val(s);
		kernel.showDialog([stext, 0, undefined, 0, ['Export CSV', function(){
			exportCSV(start, nsolves);
			return false;
		}]], 'stats', STATS_CURROUND);
		stext[0].select();
	}

	function csvField(val) {
		if (val.indexOf(';') != -1) {
			val = '"' + val.replace(/"/g, '""') + '"';
		}
		return val;
	}

	function exportCSV(start, nsolves) {
		if (times.length == 0) return;
		if (!window.Blob) {
			alert('Do not support your browser!');
		}
		var s = ["No.;Time;Comment;Scramble"];
		for (var i=0; i<nsolves; i++) {
			var time = times[start+i][0];
			var line = [];
			line.push(i+1);
			line.push(pretty(time, true));
			line.push(csvField(times[start+i][2] ? times[start+i][2] : ""));
			line.push(times[start+i][1]);
			s.push(line.join(';'));
		}
		s = s.join("\r\n");
		var blob = new Blob([s], {'type': 'text/csv'});
		var outFile = $('<a class="click"/>').appendTo('body');
		outFile.attr('href', URL.createObjectURL(blob));
		outFile.attr('download', 'csTimerExport.csv');
		outFile[0].click();
		outFile.remove();
	}

	function infoClick(e) {
		var which = $(e.target).attr('data');
		if (which == undefined) {
			return;
		}
		var idx = ~~(which.substr(2));
		switch (which.substr(0,2)) {
		case 'bs': setHighlight(bestTimeIndex, 1, 10, true); break;
		case 'cs': setHighlight(times.length - 1, 1, 10, true); break;
		case 'bm': setHighlight(bestMoIndex, moSize, moSize * 10, true); break;
		case 'cm': setHighlight(times.length - moSize, moSize, moSize * 10, true); break;
		case 'ba': setHighlight(bestAvgIndex[idx], avgSizes[idx], avgSizes[idx] * 10, false); break;
		case 'ca': setHighlight(times.length - avgSizes[idx], avgSizes[idx], avgSizes[idx] * 10, false); break;
		case 'tt': getStats(); break;
		}
	}

	var hlstr = STATS_STRING.split('|');

	var assistant = (function() {

		var infoDiv = $('<div />').css('text-align', 'center');

		function updateInfo() {
			if (!isEnable) {
				return;
			}
			var theStats = getAllStats();
			var numdnf = theStats[0];
			var sessionavg = theStats[1];
			var sessionmean = theStats[2];

			var s = [];
			s.push('<span class="click" data="tt">' + hlstr[4].replace("%d", (times.length - numdnf) + "/" + times.length) + ', ' + hlstr[9].replace("%v", kpretty(sessionmean)) + '</span>\n');
			s.push(hlstr[0] + ": " + kpretty(bestTime));
			s.push(' | ' + hlstr[2] + ": " + kpretty(worstTime) + "\n");
			var hasTable = false;
			var tableHead = '<table class="table"><tr><td></td><td>' + hlstr[1] + '</td><td>' + hlstr[0] + '</td></tr>';
			if (times.length >= moSize) {
				hasTable || (hasTable = true, s.push(tableHead));
				s.push('<tr><td>' + hlstr[6].replace("%mk", moSize) + "</td>");
				s.push('<td><span class="click" data="cm">' + kpretty(lastMo[0]) + " (σ=" + trim(lastMo[1], 2) + ')</span></td>');
				s.push('<td><span class="click" data="bm">' + kpretty(bestMo[0]) + " (σ=" + trim(bestMo[1], 2) + ')</span></td></tr>');
			}
			for (var j = 0; j < avgSizes.length; j++) {
				if (times.length >= avgSizes[j]) {
					hasTable || (hasTable = true, s.push(tableHead));
					s.push('<tr><td>' + hlstr[7].replace("%mk", avgSizes[j]));
					s.push('<td><span class="click" data="ca' + j + '">' + kpretty(lastAvg[j][0]) + " (σ=" + trim(lastAvg[j][1], 2)
						+ ')</span></td>');
					s.push('<td><span class="click" data="ba' + j + '">' + kpretty(bestAvg[j][0]) + " (σ=" + trim(bestAvg[j][1], 2)
						+ ')</span></td></tr>');
				}
			}
			hasTable && s.push('</table>');
			s = s.join("");
			infoDiv.html(s.replace(/\n/g, '<br>'));
		}

		var isEnable = false;

		function execFunc(fdiv, signal) {
			if (!(isEnable = (fdiv != undefined))) {
				return;
			}
			if (/^scr/.exec(signal)) {
				return;
			}
			fdiv.empty().append(infoDiv.unbind('click').click(infoClick));
			updateInfo();
		}

		$(function() {
			if (typeof tools != "undefined") {
				tools.regTool('stats', TOOLS_STATS, execFunc);
			}
		});

		return {
			update: updateInfo
		}

	})();

	function getMinMaxInt() {
		var diffValues = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
		var max = 0, min = 0x7fffffff, n_solve = 0, diff;
		for (var i=0; i<times.length; i++) {
			if (times[i][0][0] != -1) {
				var value = timesAt(i);
				max = Math.max(value, max);
				min = Math.min(value, min);
				n_solve++;
			}
		}
		if (n_solve == 0) {
			return null;
		}
		if (kernel.getProp('disPrec') == 'a') {
			diff = (max - min) / 10;
			for (var i=0; i<diffValues.length; i++) {
				if (diff < diffValues[i]) {
					diff = diffValues[i];
					break;
				}
			}
		} else {
			diff = diffValues[kernel.getProp('disPrec')];
		}
		return [max, min, diff];
	}

	function timesAt(idx) {
		return (times[idx][0][0] == -1) ? -1 : (~~((times[idx][0][0] + times[idx][0][1]) / roundMilli)) * roundMilli;
	}

	var distribution = (function() {
		var div = $('<div />');

		var isEnable = false;

		var diffValues = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];

		function updateDistribution() {
			if (!isEnable) {
				return;
			}
			div.empty();

			var data = getMinMaxInt();

			if (!data) {
				return;
			}

			var max = data[0], min = data[1], diff = data[2];

			var dis = {};

			var cntmax = 0;

			for (var i=0; i<times.length; i++) {
				if (times[i][0][0] != -1) {
					var value = timesAt(i);
					var cur = ~~(value / diff);
					dis[cur] = (dis[cur] || 0) + 1;
					cntmax = Math.max(dis[cur], cntmax);
				}
			}

			var str = [];
			var pattern = diff >= 1000 ? /[^\.]+(?=\.)/ : /[^\.]+\.[\d]/;
			var lablen = kpretty(~~(max/diff)*diff).match(pattern)[0].length;
			for (var i=~~(min/diff); i<=~~(max/diff); i++) {
				var label = kpretty(i * diff).match(pattern)[0];
				var len = label.length;
				for (var j=0; j<lablen - len; j++) {
					label = "&nbsp;" + label;
				}
				str.push(label + "+: " + '<span class="cntbar" style="width: ' + (dis[i] || 0)/cntmax*10 + 'em;">' + (dis[i] || 0) + "</span>");
			}
			div.html(str.join("<br>"));
		}

		function execFunc(fdiv, signal) {
			if (!(isEnable = (fdiv != undefined))) {
				return;
			}
			if (/^scr/.exec(signal)) {
				return;
			}
			fdiv.empty().append(div);
			updateDistribution();
		}

		$(function() {
			if (typeof tools != "undefined") {
				kernel.regListener('distribution', 'property', function(signal, value) {
					if (value[0] == 'disPrec') {
						updateDistribution();
					}
				}, /^disPrec$/);
				kernel.regProp('tools', 'disPrec', 1, STATS_PREC, ['a', ['a',0,1,2,3,4,5,6,7,8,9], STATS_PREC_STR.split('|')]);
				tools.regTool('distribution', TOOLS_DISTRIBUTION, execFunc);
			}
		});

		return {
			update: updateDistribution
		}
	})();

	var trend = (function() {
		var canvas = $('<canvas />'), ctx;

		var isEnable = false;

		var offx = 35, offy = 25;
		var width, height;

		function updateTrend() {
			if (!isEnable) {
				return;
			}
			if (!canvas[0].getContext) {
				return;
			}
			ctx = canvas[0].getContext('2d');
			var imgSize = kernel.getProp('imgSize') / 10;
			width = 50;
			canvas.width(10 * imgSize * 1.2 + 'em');
			canvas.height(5 * imgSize * 1.2 + 'em');

			canvas.attr('width', 10 * width + 1);
			canvas.attr('height', 5 * width + 5);

			height = 5 * width;
			width = 10 * width;

			ctx.lineWidth = 2;

			ctx.font = '12pt Arial';
			ctx.fillText("time", 50, 13);
			ctx.strokeStyle = '#888'; ctx.beginPath(); ctx.moveTo(90, 7); ctx.lineTo(150, 7); ctx.stroke();
			ctx.fillText((stat1 > 0 ? "ao" : "mo") + len1, 200, 13);
			ctx.strokeStyle = '#f00'; ctx.beginPath(); ctx.moveTo(240, 7); ctx.lineTo(300, 7); ctx.stroke();
			ctx.fillText((stat2 > 0 ? "ao" : "mo") + len2, 350, 13);
			ctx.strokeStyle = '#00f'; ctx.beginPath(); ctx.moveTo(390, 7); ctx.lineTo(450, 7); ctx.stroke();

			var data = getMinMaxInt();
			if (!data) {
				return;
			}

			var diff = data[2];
			var plotmax = Math.ceil(data[0] / diff) * diff;
			var plotmin = ~~(data[1] / diff) * diff;
			var ploth = plotmax - plotmin;
			var pattern = diff >= 1000 ? /[^\.]+(?=\.)/ : /[^\.]+\.[\d]/;

			fill([0, 1, 1, 0, 0], [0, 0, 1, 1, 0], '#fff');

			ctx.fillStyle = '#000';
			ctx.strokeStyle = '#ccc';
			ctx.lineWidth = 1;
			ctx.textAlign = 'right';
			for (var i = plotmin; i <= plotmax; i += diff) {
				plot([0, 1], [(i - plotmin) / ploth, (i - plotmin) / ploth], '#ccc');

				var label = kpretty(i).match(pattern)[0];
				ctx.fillText(label, offx - 5, (plotmax - i) / ploth * (height - offy) + offy + 5);
			}

			ctx.lineWidth = 2;
			var x, y;
			if (times.length > 1) {
				x = []; y = [];
				for (var i = 0; i < times.length; i++) {
					if (times[i][0][0] != -1) {
						x.push(i / (times.length - 1));
						y.push(Math.max(0, Math.min(1, (timesAt(i) - plotmin) / ploth)));
					}
				}
				plot(x, y, '#888');
			}
			if (times.length > len1) {
				x = []; y = [];
				var ao5 = runAvgMean(0, times.length, len1, stat1 > 0 ? undefined : 0)[0];
				for (var i = 0; i < ao5.length; i++) {
					if (ao5[i] != -1) {
						x.push((i + len1 - 1) / (times.length - 1));
						y.push(Math.max(0, Math.min(1, (ao5[i] - plotmin) / ploth)));
					}
				}
				plot(x, y, '#f00');
			}
			if (times.length > len2) {
				x = []; y = [];
				var ao12 = runAvgMean(0, times.length, len2, stat2 > 0 ? undefined : 0)[0];
				for (var i = 0; i < ao12.length; i++) {
					if (ao12[i] != -1) {
						x.push((i + len2 - 1) / (times.length - 1));
						y.push(Math.max(0, Math.min(1, (ao12[i] - plotmin) / ploth)));
					}
				}
				plot(x, y, '#00f');
			}

			plot([0, 1, 1, 0, 0], [0, 0, 1, 1, 0], '#000');
		}

		function plot(x, y, color) {
			ctx.strokeStyle = color;
			ctx.beginPath();
			ctx.moveTo(x[0] * (width - offx) + offx, (1 - y[0]) * (height - offy) + offy);
			for (var i = 1; i < x.length; i++) {
				ctx.lineTo(x[i] * (width - offx) + offx, (1 - y[i]) * (height - offy) + offy);
			}
			ctx.stroke();
			ctx.closePath();
		}

		function fill(x, y, color) {
			ctx.fillStyle = color;
			ctx.beginPath();
			ctx.moveTo(x[0] * (width - offx) + offx, (1 - y[0]) * (height - offy) + offy);
			for (var i = 1; i < x.length; i++) {
				ctx.lineTo(x[i] * (width - offx) + offx, (1 - y[i]) * (height - offy) + offy);
			}
			ctx.fill();
			ctx.closePath();
		}

		function execFunc(fdiv, signal) {
			if (!(isEnable = (fdiv != undefined))) {
				return;
			}
			if (/^scr/.exec(signal)) {
				return;
			}
			fdiv.empty().append(canvas);
			updateTrend();
		}

		$(function() {
			if (typeof tools != "undefined") {
				kernel.regListener('trend', 'property', function(signal, value) {
					if (value[0] == 'disPrec') {
						updateTrend();
					}
				}, /^disPrec$/);
				if (canvas[0].getContext) {
					tools.regTool('trend', TOOLS_TREND, execFunc);;
				}
			}
		});

		return {
			update: updateTrend
		}
	})();


	function getStats() {
		var theStats = getAllStats();
		var numdnf = theStats[0];
		var sessionavg = theStats[1];
		var sessionmean = theStats[2];
		var length = times.length;

		var now = new Date();
		var s = [hlstr[3]
			.replace("%Y", now.getFullYear())
			.replace("%M", now.getMonth()+1)
			.replace("%D", now.getDate())];
		s.push(hlstr[4].replace("%d", (length - numdnf) + "/" + length) + '\n');
		s.push(hlstr[5]);
		s.push('    ' + hlstr[0] + ": " + kpretty(bestTime));
		s.push('    ' + hlstr[2] + ": " + kpretty(worstTime) + "\n");
		if (length >= moSize) {
			s.push(hlstr[6].replace("%mk", moSize));
			s.push('    ' + hlstr[1] + ": " + kpretty(lastMo[0]) + " (σ = " + trim(lastMo[1], 2) + ")");
			s.push('    ' + hlstr[0] + ": " + kpretty(bestMo[0]) + " (σ = " + trim(bestMo[1], 2) + ")\n");
		}
		for (var j = 0; j < avgSizes.length; j++) {
			if (length >= avgSizes[j]) {
				s.push(hlstr[7].replace("%mk", avgSizes[j]));
				s.push('    ' + hlstr[1] + ": " + kpretty(lastAvg[j][0]) + " (σ = " + trim(lastAvg[j][1], 2) + ")");
				s.push('    ' + hlstr[0] + ": " + kpretty(bestAvg[j][0]) + " (σ = " + trim(bestAvg[j][1], 2) + ")\n");
			}
		}

		s.push(hlstr[8].replace("%v", kpretty(sessionavg[0])).replace("%sgm", trim(sessionavg[1], 2)).replace(/[{}]/g, ""));
		s.push(hlstr[9].replace("%v", kpretty(sessionmean) + '\n'));

		if (length != 0) {
			s.push(hlstr[10]);
			var timeStr = [];
			for (var i=0; i<length; i++) {
				var time = times[i][0];
				if (kernel.getProp('printScr')) {
					timeStr.push((i+1) + ". ");
				}
				timeStr.push(pretty(time, true));
				timeStr.push((times[i][2] ? "[" + times[i][2] + "]" : ""));
				if (kernel.getProp('printScr')) {
					timeStr.push("   " + times[i][1] + " \n");
				} else {
					timeStr.push(", ");
				}
			}
			timeStr = timeStr.join("");
			timeStr = timeStr.substr(0, timeStr.length - 2);
			s.push(timeStr);
		}
		s = s.join("\n");
		stext.val(s);
		kernel.showDialog([stext, 0, undefined, 0, ['Export CSV', function(){
			exportCSV(0, length);
			return false;
		}]], 'stats', STATS_CURSESSION);
		stext[0].select();
	}

	function getAllStats() {
		bestAvg = [];
		lastAvg = [];
		bestAvgIndex = [];
		bestTime = -1;
		bestTimeIndex = 0;
		worstTime = -1;
		worstTimeIndex = 0;
		var numdnf = 0;
		var sessionsum = 0;
		bestMo = [-1,0];
		lastMo = [-1,0];
		bestMoIndex = 0;

		for (var j = 0; j < avgSizes.length; j++) {
			if (times.length < avgSizes[j]) {
				break;
			}
			var avgmean = runAvgMean(0, times.length, avgSizes[j], undefined, true)[0];
			var best = -1;
			for (var i = 0; i < avgmean.length; i++) {
				if (best < 0 || (avgmean[i] != -1 && avgmean[i] < best)) {
					best = avgmean[i];
					bestAvgIndex[j] = i;
				}
			}
			lastAvg[j] = runAvgMean(avgmean.length - 1, avgSizes[j]);
			bestAvg[j] = runAvgMean(bestAvgIndex[j], avgSizes[j]);
		}
		if (times.length >= moSize) {
			var avgmean = runAvgMean(0, times.length, moSize, 0, true)[0];
			var best = -1;
			for (var i = 0; i < avgmean.length; i++) {
				if (best < 0 || (avgmean[i] != -1 && avgmean[i] < best)) {
					best = avgmean[i];
					bestMoIndex = i;
				}
			}
			lastMo = runAvgMean(avgmean.length - 1, moSize, 0, 0);
			bestMo = runAvgMean(bestMoIndex, moSize, 0, 0);
		}
		for (var i = 0; i < times.length; i++) {
			var thisTime = timesAt(i);
			if (bestTime < 0 || (thisTime != -1 && thisTime < bestTime)) {
				bestTime = thisTime;
				bestTimeIndex = i;
			}
			if (thisTime > worstTime) {
				worstTime = thisTime;
				worstTimeIndex = i;
			}
			if (thisTime == -1) {numdnf++;}
			else {sessionsum += thisTime;}
		}

		var sessionavg = runAvgMean(0, times.length);
		var sessionmean = (numdnf == times.length) ? -1 : round(sessionsum / (times.length - numdnf));

		return [numdnf, sessionavg, sessionmean];
	}

	function dnfsort(a, b) {
		if (a<0) return 1;
		if (b<0) return -1;
		return a - b;
	}

	//ret length: length - nsolves + 1
	function runAvgMean(start, length, nsolves, trim, onlyavg) {
		nsolves = nsolves || length;
		if (trim === undefined) {
			trim = Math.ceil(nsolves / 20);
		}
		if (nsolves - trim <= 0) {
			return [-1, 0, [], []];
		}
		var rbt = redblack.tree(dnfsort);
		var n_dnf = 0;
		for (var j = 0; j < nsolves; j++) {
			var t = timesAt(start + j);
			rbt.insert(t, j);
			n_dnf += t == -1;
		}
		var neff = nsolves - 2 * trim;
		var retAvg = [n_dnf > trim ? -1 : round((rbt.cumSum(nsolves - trim) - rbt.cumSum(trim)) / neff)];
		var start0 = start - nsolves;
		for (var i = nsolves; i < length; i++) {
			var t = timesAt(start + i);
			var t0 = timesAt(start0 + i);
			rbt.remove(t0);
			rbt.insert(t, j);
			n_dnf += t == -1;
			n_dnf -= t0 == -1;
			retAvg.push(n_dnf > trim ? -1 : round((rbt.cumSum(nsolves - trim) - rbt.cumSum(trim)) / neff));
		}
		var mintList = [];
		var maxtList = [];
		var variance = 0;
		if (!onlyavg && length == nsolves) {
			retAvg = retAvg[0];
			var timeArr = [];
			for (var j = 0; j < nsolves; j++) {
				var t = timesAt(start + j);
				timeArr.push(t);
				n_dnf += t == -1;
			}
			if (trim != 0) {
				rbt.traverse(function(node) {
					timeArr[node.value] = 0;
					return mintList.push(node.value) < trim;
				}, false);
				rbt.traverse(function(node) {
					timeArr[node.value] = 0;
					return maxtList.push(node.value) < trim;
				}, true);
			}
			for (var j = 0; j < nsolves; j++) {
				variance += Math.pow(timeArr[j], 2);
			}
			var avg = (rbt.cumSum(nsolves - trim) - rbt.cumSum(trim));
			variance = Math.sqrt((variance  - avg * avg / neff) / (neff - 1)) / 1000;
		}
		return [retAvg, variance, mintList, maxtList];
	}

	function trim(number, nDigits) {
		if (!number || number == Number.POSITIVE_INFINITY || number == Number.NEGATIVE_INFINITY) number = 0;
		var power = Math.pow(10, nDigits);
		var trimmed = "" + Math.round(number * power);
		while (trimmed.length < nDigits + 1) {
			trimmed = "0" + trimmed;
		}
		var len = trimmed.length;
		return trimmed.substr(0,len - nDigits) + "." + trimmed.substr(len - nDigits, nDigits);
	}

	var scramble = "";

	var stat1, stat2, len1, len2;

	var curScrType = '333';

	var roundMilli = 1;

	function procSignal(signal, value) {
		if (signal == 'time') {
			push(value);
		} else if (signal == 'scramble') {
			scramble = value[1];
		} else if (signal == 'property') {
			if (/^(:?useMilli|timeFormat|stat[12][tl])$/.exec(value[0])) {
				roundMilli = kernel.getProp('useMilli') ? 1 : 10;
				stat1 = [1, -1][~~kernel.getProp('stat1t')] * kernel.getProp('stat1l');
				stat2 = [1, -1][~~kernel.getProp('stat2t')] * kernel.getProp('stat2l');
				len1 = Math.abs(stat1);
				len2 = Math.abs(stat2);
				updateTable(false);
			} else if (value[0] == 'session' && ~~value[1] != sessionIdx) {
				select.val(value[1]);
				select.change();
			} else if (value[0] == 'sessionName') {
				genSelect();
			} else if (value[0] == 'scrType') {
				curScrType = value[1];
				var sessionScr = JSON.parse(kernel.getProp('sessionScr'));
				if (sessionScr[sessionIdx] != value[1]) {
					if (kernel.getProp('scr2ss')) {
						select.val('new');
						select.change();
					} else {
						sessionScr[sessionIdx] = value[1];
						kernel.setProp('sessionScr', JSON.stringify(sessionScr));
					}
				}
			} else if (value[0] == 'statsum') {
				updateSumTable();
			}
		} else if (signal == 'ctrl' && value[0] == 'stats') {
			if (value[1] == 'clr') {
				reset();
			} else if (value[1] == 'undo') {
				if (times.length != 0) {
					delIdx(times.length - 1);
				}
			} else if (value[1] == '+') {
				if (sessionIdx < sessionIdxMax) {
					kernel.setProp('session', sessionIdx+1);
				}
			} else if (value[1] == '-') {
				if (sessionIdx > sessionIdxMin) {
					kernel.setProp('session', sessionIdx-1);
				}
			} else if (value[1] == 'OK') {
				floatCfm.setCfm(0);
			} else if (value[1] == '+2') {
				floatCfm.setCfm(2000);
			} else if (value[1] == 'DNF') {
				floatCfm.setCfm(-1);
			}
		} else if (signal == 'ashow' && !value) {
			hideAll();
		} else if (signal == 'button' && value[0] == 'stats' && value[1]) {
			setTimeout(resultsHeight, 50);
		}
	}

	function renameSession() {
		var curNameList = JSON.parse(kernel.getProp('sessionName'));
		var sName = prompt(STATS_SESSION_NAME, curNameList[sessionIdx]);
		if (sName != null) {
			sName = $('<div/>').text(sName).html();
			curNameList[sessionIdx] = sName;
			kernel.setProp('sessionName', JSON.stringify(curNameList));
		}
	}

	function save() {
		console.log(times);
        localStorage['session' + sessionIdx] = JSON.stringify(times);
	}

	function resultsHeight() {
		if (scrollDiv[0].offsetParent != null) {
			scrollDiv.outerHeight(~~(div.height() - select.outerHeight() - sumtable.outerHeight()));
		}
	}

	$(function() {
		kernel.regListener('stats', 'time', procSignal);
		kernel.regListener('stats', 'scramble', procSignal);
		kernel.regListener('stats', 'property', procSignal, /^(:?useMilli|timeFormat|stat(:?sum|[12][tl])|session(:?Name)?|scrType)$/);
		kernel.regListener('stats', 'ctrl', procSignal, /^stats$/);
		kernel.regListener('stats', 'ashow', procSignal);
		kernel.regListener('stats', 'button', procSignal);

		kernel.regProp('stats', 'statsum', 0, PROPERTY_SUMMARY, [true]);
		kernel.regProp('stats', 'printScr', 0, PROPERTY_PRINTSCR, [true]);
		kernel.regProp('stats', 'imrename', 0, PROPERTY_IMRENAME, [false]);
		kernel.regProp('stats', 'scr2ss', 0, PROPERTY_SCR2SS, [false]);
		kernel.regProp('stats', 'ss2scr', 0, PROPERTY_SS2SCR, [true]);

		var stattl = STATS_TYPELEN.split('|');
		kernel.regProp('stats', 'stat1t', 1, stattl[0].replace('%d', 1), [0, [0, 1], stattl.slice(2)]);
		kernel.regProp('stats', 'stat1l', 2, stattl[1].replace('%d', 1), [5, 3, 1000]);
		kernel.regProp('stats', 'stat2t', 1, stattl[0].replace('%d', 2), [0, [0, 1], stattl.slice(2)]);
		kernel.regProp('stats', 'stat2l', 2, stattl[1].replace('%d', 2), [12, 3, 1000]);
		kernel.regProp('stats', 'delmul', 0, PROPERTY_DELMUL, [true]);

		select.val(sessionIdx);
		var timeStr = localStorage['session' + sessionIdx];
		if (timeStr != undefined && timeStr != '') {
			times = JSON.parse(timeStr);
		}
		sessionIdxMax = kernel.getProp('sessionN', 15);
		var sessionName = JSON.parse(kernel.getProp('sessionName', '{}'));
		var sessionScr = JSON.parse(kernel.getProp('sessionScr', '{}'));
		for (var i=1; i<=sessionIdxMax; i++) {
			sessionName[i] = sessionName[i] || i;
			sessionScr[i] = sessionScr[i] || '333';
		}
		kernel.setProp('sessionName', JSON.stringify(sessionName));
		kernel.setProp('sessionScr', JSON.stringify(sessionScr));
		genSelect();
		kernel.getProp('session', 1);

		div.appendTo('body').append(
			$('<span class="click" />').html(STATS_SESSION).click(renameSession), 
			select, $('<input type="button">').val('X').click(reset), 
			sumtable, 
			scrollDiv.append(table));
		//set height after the statsDiv appended
		// setTimeout(resultsHeight, 100);
		//add resize listener to the window
		$(window).bind('resize', resultsHeight);
		table.append(title, avgRow);
		kernel.addWindow('stats', BUTTON_TIME_LIST, div, false, true, 4);
		updateTable();
	});
})(kernel.pretty, kernel.round);
