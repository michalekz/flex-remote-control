const { getLogger } = require("../core/logger.js");

class flexDominator {
    constructor(masterEmit, defcon, controller)
    {
        this.Emitter = masterEmit;
        this.Defcon = defcon;
        this.Controller = controller; // Reference to MIDI controller (for toggleTuningMode)
        this.logger = getLogger();
    }

    xmit(elm, flx)
    {
        let sl = this.getRequestedSlice(elm);
        flx["Slice"+sl].tx = elm.State;
        
        this.logger.debug(`PTT: Slice${sl}, State=${elm.State}`);
        this.Emitter.emit("cptt", sl, this.getRealSlice(sl, flx), elm.State);
    }

    modes(elm, flx)
    {
        let sl = this.getRequestedSlice(elm);
        let n_mode = this.#getNext(flx["Slice"+sl].mode, flx["Slice"+sl].mode_list, this.Defcon.NotValidModes);

        flx["Slice"+sl].mode = n_mode;
        this.logger.debug(`Mode changed: Slice${sl} → ${n_mode}`);
        return "slice s "+ this.getRealSlice(sl, flx) + " mode=" + n_mode;
    }

    #getNext(mode, modelist, notlist = null)
    {
        let cur_idx = modelist.indexOf(mode);
        cur_idx++;

        if(cur_idx == modelist.length)
            cur_idx = 0;

        if(notlist != null)
        {
            while(notlist.indexOf(modelist[cur_idx]) > -1)
            {
                cur_idx++;
    
                if(cur_idx == modelist.length)
                    cur_idx = 0;
            }    
        }

        return modelist[cur_idx];
    }

    #hundret27to100Converter(value127)
    {
        return Math.round(value127*0.7874);
    }

    #Spreader(state, factor, middle = 64)
    {
        let realstate = state-middle; 
        return Math.round(realstate*factor);
    }

    rit(elm, flx)
    {
        let sl = this.getRequestedSlice(elm);

        let ritfac = this.Defcon.RitFreq[0]/63;
        if(flx["Slice"+sl].mode == "CW")
            ritfac=this.Defcon.RitFreq[1]/63;

        let getRealRit = this.#Spreader(elm.State, ritfac)

        if(getRealRit == 0 )
            return "slice s "+ this.getRealSlice(sl, flx) + " rit_on=0 rit_freq=0";

        this.logger.debug(`RIT: Slice${sl} → ${getRealRit} Hz`);
        return "slice s "+ this.getRealSlice(sl, flx) + " rit_on=1 rit_freq=" + this.#Spreader(elm.State, ritfac);
    }

    xit(elm, flx)
    {
        let sl = this.getRequestedSlice(elm);

        let ritfac = this.Defcon.RitFreq[0]/63;
        if(flx["Slice"+sl].mode == "CW")
            ritfac=this.Defcon.RitFreq[1]/63;

        let getRealRit = this.#Spreader(elm.State, ritfac)

        if(getRealRit == 0 )
            return "slice s "+ this.getRealSlice(sl, flx) + " xit_on=0 xit_freq=0";

        this.logger.debug(`XIT: Slice${sl} → ${getRealRit} Hz`);
        return "slice s "+ this.getRealSlice(sl, flx) + " xit_on=1 xit_freq=" + this.#Spreader(elm.State, ritfac);
    }

    volume(elm, flx)
    {
        let sl = this.getRequestedSlice(elm);
        let gain = this.#hundret27to100Converter(elm.State);
        this.logger.debug(`Volume: Slice${sl} → ${gain}%`);
        return "audio client "+ flx.client_handle + " slice " +  this.getRealSlice(sl, flx) + " gain " + gain;
    }

    agc(elm, flx)
    {
        let sl = this.getRequestedSlice(elm);
        this.logger.debug(`AGC: Slice${sl} → ${elm.State}`);
        return "slice s "+ this.getRealSlice(sl, flx) + " agc_threshold=" + elm.State;
    }

    vfo(elm, flx)
    {
        // Wait for FlexRadio initialization before processing VFO events
        if(!flx.IsInit || flx.SliceNumbs.length === 0) {
            this.logger.debug("FlexRadio not initialized yet, ignoring VFO event");
            return null;
        }
        
        let sl = this.getRequestedSlice(elm);
        
        // Access correct slice object
        let sliceObj = (sl == 0) ? flx.Slice0 : flx.Slice1;
        
        if(!sliceObj || sliceObj.RF_frequency === undefined) {
            this.logger.error(`Slice${sl} object is undefined or has no RF_frequency`);
            return null;
        }
        
        // State < 64 (typically 1) = clockwise rotation = tune UP
        // State >= 64 (typically 127) = counterclockwise rotation = tune DOWN
        let stepDirection = (elm.State < 64) ? 1 : -1;
        let stepSize = sliceObj.step * 0.000001; // Convert Hz to MHz
        
        // Calculate new frequency
        let newFreq = sliceObj.RF_frequency + (stepSize * stepDirection);
        
        // Update local cache
        if(sl == 0) {
            flx.Slice0.RF_frequency = newFreq;
        } else {
            flx.Slice1.RF_frequency = newFreq;
        }
        
        let realSliceNum = this.getRealSlice(sl, flx);
        this.logger.debug(`VFO: Slice${sl} → ${newFreq.toFixed(6)} MHz (${stepDirection > 0 ? 'UP' : 'DOWN'})`);
        return `slice tune ${realSliceNum} ${newFreq.toFixed(6)}`;
    }

    steps(elm, flx)
    {
        let sl = this.getRequestedSlice(elm);
        flx["Slice"+sl].step = this.#getNext(flx["Slice"+sl].step, flx["Slice"+sl].step_list, this.Defcon.NotValidSteps);

        this.logger.debug(`Step size: Slice${sl} → ${flx["Slice"+sl].step} Hz`);
        return "slice s "+ this.getRealSlice(sl, flx) + " step=" + flx["Slice"+sl].step;
    }

    /**
     * Handle jog wheel frequency change (velocity-based tuning)
     * Called from djcontrollerstarlight.handleJogWheelEvent()
     * @param {object} elm - Element with frequency in State property
     * @param {object} flx - FlexRadio state
     * @returns {string} FlexRadio command
     */
    jogFrequencyChange(elm, flx)
    {
        const deltaHz = elm.State; // Frequency CHANGE in Hz from accumulator
        const sl = this.getRequestedSlice(elm);

        // Get current frequency from FlexRadio state (in MHz)
        const currentFreqMHz = (sl === 0) ? flx.Slice0.RF_frequency : flx.Slice1.RF_frequency;
        const currentFreqHz = currentFreqMHz * 1000000;

        // Calculate new frequency
        const newFreqHz = currentFreqHz + deltaHz;
        const newFreqMHz = newFreqHz / 1000000;

        // Update local state
        if (sl === 0) {
            flx.Slice0.RF_frequency = newFreqMHz;
        } else {
            flx.Slice1.RF_frequency = newFreqMHz;
        }

        const realSliceNum = this.getRealSlice(sl, flx);
        this.logger.debug(`Jog tune: Slice${sl} ${currentFreqMHz.toFixed(6)} MHz → ${newFreqMHz.toFixed(6)} MHz (Δ${(deltaHz/1000).toFixed(2)} kHz, ${elm.velocity?.toFixed(1) || 'N/A'} ev/s, ${elm.mode || 'N/A'})`);

        return `slice tune ${realSliceNum} ${newFreqMHz.toFixed(6)}`;
    }

    /**
     * Toggle tuning mode (ModeA_Fine → ModeA_Coarse → ModeB_Velocity)
     * Called from button mapping in Hercules.xlsx
     * This is a wrapper that calls controller's toggleTuningMode()
     * @param {object} elm - Element with Part property (A or B for left/right deck)
     * @param {object} flx - FlexRadio state (not used)
     * @returns {string} Empty string (no FlexRadio command needed)
     */
    toggleTuningMode(elm, flx)
    {
        // Call controller's toggleTuningMode() and pass elm to determine which deck
        if (this.Controller && typeof this.Controller.toggleTuningMode === 'function') {
            this.Controller.toggleTuningMode(elm);
        } else {
            this.logger.error("Controller not available or toggleTuningMode not implemented");
        }
        return ""; // No FlexRadio command needed
    }

    filters(elm, flx)
    {
        let sl = this.getRequestedSlice(elm);

        let fildif = flx["Slice"+sl].filter_hi-flx["Slice"+sl].filter_lo;
        if(flx["Slice"+sl].mode=="CW" || flx["Slice"+sl].mode=="AM")
        {
            let n_fil = this.#getNext(fildif, flx.CWFilter, null)

            let half = n_fil/2;
            flx["Slice"+sl].filter_lo= -half;
            flx["Slice"+sl].filter_hi= half;

        }
        else if(flx["Slice"+sl].mode=="LSB" || flx["Slice"+sl].mode=="DIGL")
        {
            flx["Slice"+sl].filter_hi = -100;

            fildif = (-1)*flx["Slice"+sl].filter_lo+flx["Slice"+sl].filter_hi;
            let n_fil = this.#getNext(fildif, flx.Filter, null);

            flx["Slice"+sl].filter_lo= flx["Slice"+sl].filter_hi-n_fil;
        }
        else if(flx["Slice"+sl].mode=="RTTY")
        {
            let fildif = flx["Slice"+sl].filter_hi-flx["Slice"+sl].filter_lo;

            if(fildif == 270)
                fildif=250;

            let n_fil = this.#getNext(fildif, flx.CWFilter, null)

            let half = n_fil/2;

            flx["Slice"+sl].filter_lo= -half-85;
            flx["Slice"+sl].filter_hi= half-85;

            flx["Slice"+sl].filter_hi= flx["Slice"+sl].filter_lo+n_fil;
        }
        else
        {
            flx["Slice"+sl].filter_lo = 100;

            fildif = flx["Slice"+sl].filter_hi-flx["Slice"+sl].filter_lo
            let n_fil = this.#getNext(fildif, flx.Filter, null);

            flx["Slice"+sl].filter_hi= flx["Slice"+sl].filter_lo+n_fil;
        }

        flx["Slice"+sl].InitFilterBW = flx["Slice"+sl].filter_hi-flx["Slice"+sl].filter_lo;

        this.logger.debug(`Filter: Slice${sl} → ${flx["Slice"+sl].filter_lo}/${flx["Slice"+sl].filter_hi} Hz`);
        return "filt "+ this.getRealSlice(sl, flx)+" "+ flx["Slice"+sl].filter_lo +" "+flx["Slice"+sl].filter_hi;
    }

    toggleRXANT(elm, flx)
    {
        let sl = this.getRequestedSlice(elm);

        let antNum = 1;
        let rxnum = "A";

        if(sl == 1)
        {
            antNum = 2;
            rxnum = "B";    
        }

        if(flx["Slice"+sl].rxant == flx["Slice"+sl].txant)
            flx["Slice"+sl].rxant = "RX_"+rxnum;
        else
            flx["Slice"+sl].rxant = flx["Slice"+sl].txant;

        this.logger.debug(`RX Antenna: Slice${sl} → ${flx["Slice"+sl].rxant}`);
        return "slice s "+ this.getRealSlice(sl, flx) + " rxant=" + flx["Slice"+sl].rxant;
    }

    toggleTXANT(elm, flx)
    {
        let sl = this.getRequestedSlice(elm);

        if(flx["Slice"+sl].txant == "ANT1")
            flx["Slice"+sl].txant = "ANT2";
        else
            flx["Slice"+sl].txant = "ANT1";

        this.logger.debug(`TX Antenna: Slice${sl} → ${flx["Slice"+sl].txant}`);
        return "slice s "+ this.getRealSlice(sl, flx) + " txant=" + flx["Slice"+sl].txant;
    }

    panBW(elm, flx)
    {
        let sl = this.getRequestedSlice(elm);

        if(flx.PanBW.indexOf(flx["Slice"+sl].panbandwidth) == -1)
        {
            flx["Slice"+sl].panbandwidth = flx.PanBW[flx.PanBW.length-1];
        }

        let n_bw = this.#getNext(flx["Slice"+sl].panbandwidth, flx.PanBW, null);
        flx["Slice"+sl].panbandwidth = n_bw;

        this.logger.debug(`Pan BW: Slice${sl} → ${n_bw}`);
        setTimeout(() => this.Emitter.emit("ct", flx["Slice"+sl].RF_frequency), 1000);
        return "display panf s "+ flx["Slice"+sl].pan + " bandwidth=" + flx["Slice"+sl].panbandwidth;
    }

    center(elm, flx)
    {
        let sl = this.getRequestedSlice(elm);
        this.logger.debug(`Centering panadapter to ${flx["Slice"+sl].RF_frequency} MHz`);
        this.Emitter.emit("ct", flx["Slice"+sl].RF_frequency);
    }

    fadePan(elm, flx)
    {
        if(flx.SliceNumbs.length < 2)
            return null;
        
        let val = this.#Spreader(this.#hundret27to100Converter(elm.State), 1, 50);

        let cv = (50+val);

        if(cv < 50)
        {
            this.logger.debug(`Fade Pan: Left channel (${cv})`);
            return "audio client "+ flx.client_handle + " slice "+ this.getRealSlice(0, flx)+" pan " + cv;
        }
        this.logger.debug(`Fade Pan: Right channel (${cv})`);
        return "audio client "+ flx.client_handle + " slice "+ this.getRealSlice(1, flx)+" pan " + cv;
    }

    fadeSO2R(elm, flx)
    {
        if(flx.SliceNumbs.length < 2)
            return null;

        let val = this.#hundret27to100Converter(elm.State);

        if(val<3)
        {
            this.logger.debug("SO2R Fade: Slice A only");
            this.Emitter.emit("fadeSO2R", flx, 0, this.getRealSlice(0, flx), this.getRealSlice(1, flx));
        }
        else if(val>97)
        {
            this.logger.debug("SO2R Fade: Slice B only");
            this.Emitter.emit("fadeSO2R", flx, 1, this.getRealSlice(0, flx), this.getRealSlice(1, flx));

        }
        else
        {
            this.logger.debug("SO2R Fade: Both slices (stereo)");
            this.Emitter.emit("fadeSO2R", flx, 2, this.getRealSlice(0, flx), this.getRealSlice(1, flx));
        }
    }

    fadeSO2RMix(elm, flx)
    {
        if(flx.SliceNumbs.length < 2)
            return null;

        let val = this.#hundret27to100Converter(elm.State);

        if(val<3)
        {
            this.logger.debug("SO2R Mix: Slice A only");
            this.Emitter.emit("fadeSO2RMix", flx, 0, this.getRealSlice(0, flx), this.getRealSlice(1, flx));
        }
        else if(val>97)
        {
            this.logger.debug("SO2R Mix: Slice B only");
            this.Emitter.emit("fadeSO2RMix", flx, 1, this.getRealSlice(0, flx), this.getRealSlice(1, flx));

        }
        else
        {
            this.logger.debug("SO2R Mix: Both slices mixed");
            this.Emitter.emit("fadeSO2RMix", flx, 2, this.getRealSlice(0, flx), this.getRealSlice(1, flx))
        }
    }

    freeFilter(elm, flx)
    {
        let sl = this.getRequestedSlice(elm, flx);
        let val = (this.#hundret27to100Converter(elm.State));

        let fildif = flx["Slice"+sl].InitFilterBW;
        let newval = 0; 
        let neloval = 0; 

        if(flx["Slice"+sl].mode=="USB")
        {
            if(val<50)
            {
                newval= flx["Slice"+sl].filter_lo + flx["Slice"+sl].filter_hi-(((50-val)*2/100)*fildif);
            }
            else if(val==50)
            {
                newval= flx["Slice"+sl].filter_lo + fildif;
            }
            else{
                newval= flx["Slice"+sl].filter_lo + flx["Slice"+sl].filter_hi+(((val-50)*2/100)*fildif);
            }    
            this.logger.debug(`Free Filter (USB): Slice${sl} → ${flx["Slice"+sl].filter_lo}/${newval} Hz`);
            return "filt "+this.getRealSlice(sl, flx)+" "+ flx["Slice"+sl].filter_lo +" "+newval;
        }
        else if(flx["Slice"+sl].mode=="LSB")
        {
            if(val<50)
            {
                newval= flx["Slice"+sl].filter_lo + (((50-val)*2/100)*fildif) -100;
            }
            else if(val==50)
            {
                newval= flx["Slice"+sl].filter_hi - fildif;
            }
            else{
                newval= flx["Slice"+sl].filter_lo - (((val-50)*2/100)*fildif);
            }    
            this.logger.debug(`Free Filter (LSB): Slice${sl} → ${newval}/${flx["Slice"+sl].filter_hi} Hz`);
            return "filt "+this.getRealSlice(sl, flx)+" "+ newval +" "+flx["Slice"+sl].filter_hi;
        }
        else if(flx["Slice"+sl].mode=="CW")
        {
            let half = fildif/2;
            if(val<50)
            {
                neloval=-1*half-((val-50)*2/100)*half;
                newval=half+((val-50)*2/100)*half;
            }
            else if(val==50)
            {
                neloval= -1*half;
                newval= half;
            }
            else
            {
                neloval=-1*half-((val-50)*2/100)*half;
                newval=half+((val-50)*2/100)*half;
            }    
            this.logger.debug(`Free Filter (CW): Slice${sl} → ${neloval}/${newval} Hz`);
            return "filt "+this.getRealSlice(sl, flx)+" "+ neloval +" "+newval;
        }
    }

    monitor(elm, flx)
    {
        this.logger.debug(`Monitor: State=${elm.State}`);
        return "transmit s mon="+elm.State;
    }

    cwxLoopBtnL(elm, flx)
    {
        switch (elm.Id) {
            case "6|16":
                if(this.Defcon.CWMakro[0] !== undefined)
                {
                    this.logger.debug(`CW Macro Left 1: ${this.Defcon.CWMakro[0]}`);
                    return "cwx send "+this.#convertSpace(this.Defcon.CWMakro[0]);
                }
            case "6|17":
                if(this.Defcon.CWMakro[1] !== undefined)
                {
                    this.logger.debug(`CW Macro Left 2: ${this.Defcon.CWMakro[1]}`);
                    return "cwx send "+this.#convertSpace(this.Defcon.CWMakro[1]);
                }
            case "6|18":
                if(this.Defcon.CWMakro[2] !== undefined)
                {
                    this.logger.debug(`CW Macro Left 3: ${this.Defcon.CWMakro[2]}`);
                    return "cwx send "+this.#convertSpace(this.Defcon.CWMakro[2]);
                }
            case "6|19":
                if(this.Defcon.CWMakro[3] !== undefined)
                {
                    this.logger.debug(`CW Macro Left 4: ${this.Defcon.CWMakro[3]}`);
                    return "cwx send "+this.#convertSpace(this.Defcon.CWMakro[3]);
                }
        }
        return null;
    }

    cwxLoopBtnR(elm, flx)
    {
        switch (elm.Id) {
            case "7|16":
                if(this.Defcon.CWMakro[4] !== undefined)
                {
                    this.logger.debug(`CW Macro Right 1: ${this.Defcon.CWMakro[4]}`);
                    return "cwx send "+this.#convertSpace(this.Defcon.CWMakro[4]);
                }
            case "7|17":
                if(this.Defcon.CWMakro[5] !== undefined)
                {
                    this.logger.debug(`CW Macro Right 2: ${this.Defcon.CWMakro[5]}`);
                    return "cwx send "+this.#convertSpace(this.Defcon.CWMakro[5]);
                }
            case "7|18":
                if(this.Defcon.CWMakro[6] !== undefined)
                {
                    this.logger.debug(`CW Macro Right 3: ${this.Defcon.CWMakro[6]}`);
                    return "cwx send "+this.#convertSpace(this.Defcon.CWMakro[6]);
                }
            case "7|19":
                if(this.Defcon.CWMakro[7] !== undefined)
                {
                    this.logger.debug(`CW Macro Right 4: ${this.Defcon.CWMakro[7]}`);
                    return "cwx send "+this.#convertSpace(this.Defcon.CWMakro[7]);
                }
        }
        return null;
    }

    #convertSpace(txtcmd)
    {
        return txtcmd.replaceAll(" ", String.fromCharCode(127));
    }

    setdefault(elm, flx)
    {
        this.logger.info(`Resetting to default: ${flx.Slice0.RF_frequency} MHz, ${flx.Slice0.mode}`);
        this.Emitter.emit("def", flx.Slice0.RF_frequency, flx.Slice0.mode);
    }

    configMode(elm, flx)
    {
        this.logger.debug("Toggling config mode");
        this.Emitter.emit("con");
    }

    toggleLayer(elm, flx)
    {
        this.logger.debug("Toggling layer");
        this.Emitter.emit("tgl", elm);
    }

    toggleSlices(elm, flx)
    {
        this.logger.info("Swapping Slice A ↔ Slice B");
        flx.SliceNumbs.reverse(); 

        let s0 = flx.Slice0;
        let s1 = flx.Slice1;
        
        flx.Slice0 = s1;
        flx.Slice1 = s0;
    }

    getRequestedSlice(elm)
    {
        // Check if element has Part property (from Excel mapping)
        // Part "A" = Slice 0 (left deck), Part "B" = Slice 1 (right deck)
        if(elm.Part !== undefined && elm.Part == "B") {
            return 1;
        }
        
        // Fallback: check element ID (channel 2 = Deck B)
        if(elm.Id && elm.Id.startsWith("2|")) {
            return 1;
        }
        
        // Default to Deck A (Slice 0)
        return 0;
    }

    getRealSlice(nr, flx)
    {
        if(nr == 1)
            return flx.SliceNumbs[1];
        return flx.SliceNumbs[0];
    }
}

module.exports = flexDominator;