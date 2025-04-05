document.addEventListener("DOMContentLoaded", function() {
  // Try to create a styled search box for job selection
  try {
    const jobDropdown = document.getElementById("job-dropdown");
    if (jobDropdown) {
      // Load Select2 library dynamically if not already present
      if (typeof $ === "undefined" || typeof $.fn.select2 === "undefined") {
        console.log("Loading Select2 dynamically...");
        
        // Add CSS
        const linkElem = document.createElement("link");
        linkElem.rel = "stylesheet";
        linkElem.href = "https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/css/select2.min.css";
        document.head.appendChild(linkElem);
        
        // Add jQuery if needed
        if (typeof $ === "undefined") {
          const jqueryScript = document.createElement("script");
          jqueryScript.src = "https://code.jquery.com/jquery-3.6.0.min.js";
          jqueryScript.onload = function() {
            // After jQuery loads, load Select2
            const select2Script = document.createElement("script");
            select2Script.src = "https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js";
            select2Script.onload = initSelect2;
            document.head.appendChild(select2Script);
          };
          document.head.appendChild(jqueryScript);
        } else {
          // jQuery exists, just load Select2
          const select2Script = document.createElement("script");
          select2Script.src = "https://cdn.jsdelivr.net/npm/select2@4.1.0-rc.0/dist/js/select2.min.js";
          select2Script.onload = initSelect2;
          document.head.appendChild(select2Script);
        }
      } else {
        // Select2 already loaded
        initSelect2();
      }
      
      function initSelect2() {
        console.log("Initializing Select2...");
        try {
          // Initialize Select2
          $(jobDropdown).select2({
            placeholder: "Choose a Jenkins job...",
            allowClear: true,
            width: "100%",
            theme: "bootstrap-5"
          });
          
          // Make it work with Bootstrap styles
          const select2Container = $(jobDropdown).next(".select2-container");
          select2Container.addClass("form-control-lg");
          
          // Add some custom styles
          const style = document.createElement("style");
          style.textContent = `
            .select2-container--bootstrap-5 .select2-selection {
              height: auto \!important;
              padding: 0.5rem 1rem;
              font-size: 1.1rem;
              border-radius: 0.3rem;
            }
            .select2-container--bootstrap-5 .select2-selection--single .select2-selection__rendered {
              padding-left: 0;
              color: #212529;
            }
            .select2-container--bootstrap-5 .select2-results__option--highlighted[aria-selected] {
              background-color: #0d6efd;
            }
            .select2-container--bootstrap-5 .select2-search--dropdown .select2-search__field {
              border: 1px solid #ced4da;
              border-radius: 0.25rem;
              padding: 0.5rem;
            }
            .select2-container--bootstrap-5 .select2-results__group {
              font-weight: bold;
              padding: 0.75rem 0.25rem;
              color: #0d6efd;
              background-color: #f8f9fa;
            }
          `;
          document.head.appendChild(style);
          
          console.log("Select2 initialized successfully");
        } catch (error) {
          console.error("Failed to initialize Select2:", error);
        }
      }
    }
  } catch (error) {
    console.error("Error setting up job search dropdown:", error);
  }
});
